
# In[1]:
import os
import argparse
from torch.utils.data import DataLoader
import torch.nn.functional as F
import torch.nn as nn
import torch
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

# In[2]:
import shutil
import os
import sys

SRC = "/kaggle/input/ginot-test-data-and-configs"
DST = "/kaggle/working/ginot_test_data_and_configs"

if not os.path.exists(DST):
    shutil.copytree(SRC, DST)

sys.path.append("/kaggle/working")

# In[3]:
%pip install trimesh

# In[4]:
from ginot_test_data_and_configs import configs

from ginot_test_data_and_configs.point_encoding import (
    PointCloudPerceiverChannelsEncoder
)

from ginot_test_data_and_configs.UNets import UNet

from ginot_test_data_and_configs import torch_trainer

from ginot_test_data_and_configs.transformer import (
    SelfAttentionBlocks,
    MLP,
    ResidualCrossAttentionBlock
)

from ginot_test_data_and_configs.point_position_embedding import (
    PosEmbLinear,
    encode_position,
    position_encoding_channels
)

# 1. Normalize the Mesh and Extract Geometry (pc)
# 
# The GINOT model expects a standardized point cloud representation of the room's boundary. You must center and scale the mesh, then sample 100,000 boundary points.

# In[5]:
import trimesh
import numpy as np
import torch

# Load STL file
mesh = trimesh.load("/kaggle/input/datasets/neodecade/ginot-stl-data/room_with_furnitures.stl")
mesh = mesh.process()

# Calculate bounds for normalization
center = mesh.bounds.mean(axis=0)
scale = (mesh.bounds[1] - mesh.bounds[0]).max()

# Normalize mesh (Shift to origin and scale to unit bounds)
mesh_norm = mesh.copy()
mesh_norm.apply_translation(-center)
mesh_norm.apply_scale(1.0 / scale)

# Sample 100,000 points from the surface
pc_boundary, _ = trimesh.sample.sample_surface(mesh_norm, 100000)

# Convert to PyTorch Tensor: Shape [Batch, 100000, 3]
pc = torch.tensor(pc_boundary, dtype=torch.float32).unsqueeze(0)

# 2. Define Query Points (xyt)
# 
# The model needs to know where inside the room it should predict the airflow. xyt represents the interior collocation (query) points. Depending on your app, this could be a uniform grid or randomly sampled points within the mesh's interior volume.

# In[6]:
# Assuming you want to predict at N interior points
def sample_interior(mesh, N):
    # Sample points within the bounding box
    pts = np.random.uniform(mesh.bounds[0], mesh.bounds[1], size=(N, 3))
    # Filter points to only keep those strictly inside the room
    inside = mesh.contains(pts)
    return pts[inside]

# Sample points and scale them using the SAME center/scale as the boundary
raw_query_points = sample_interior(mesh, 50000) # Your unnormalized points
sup_xyt = (raw_query_points - center) / scale

# Convert to PyTorch Tensor: Shape [Batch, N, 3]
xyt = torch.tensor(sup_xyt, dtype=torch.float32).unsqueeze(0)

# 3. Build the Global Parameter Vector (load)
# 
# The GINOT model features a branch that accepts a 9-value tensor defining the global physical boundaries. This 1D tensor packs together the positions of the doors/vents and the input airflow velocity:
# 
#     Indices 0-2: Normalized [X, Y, Z] center of the inlet.
# 
#     Indices 3-5: Normalized [X, Y, Z] center of the outlet.
# 
#     Indices 6-8: Velocity vector [U, V, W] at the inlet.

# In[7]:
# Example: If you have your unnormalized inlet/outlet centers and velocity
# This is example center 
inlet_center_raw = np.array([10.0, 5.0, 0.0])
outlet_center_raw = np.array([-10.0, 5.0, 0.0])
inlet_velocity = np.array([2.5, 0.0, 0.0]) # 2.5 m/s in X direction

# Normalize the centers using the global center and scale
inlet_center_norm = (inlet_center_raw - center) / scale
outlet_center_norm = (outlet_center_raw - center) / scale

# Concatenate into the 9-value vector
load_array = np.concatenate([inlet_center_norm, outlet_center_norm, inlet_velocity])

# Convert to PyTorch Tensor: Shape [Batch, 9]
load = torch.tensor(load_array, dtype=torch.float32).unsqueeze(0)

# Model definition

# In[8]:
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print("Using device:", device)


# In[9]:
class Trunk(nn.Module):
    def __init__(self, branch, embed_dim=64, cross_attn_layers=4, num_heads=4,
                 in_channels=3, out_channels=4,
                 dropout=0.0, emd_version="nerf", padding_value=-10):
        super().__init__()
        self.padding_value = padding_value
        d = position_encoding_channels(emd_version)
        
        self.Q_encoder = nn.Sequential(nn.Linear(d*in_channels, 2*embed_dim),
                                       nn.ReLU(),
                                       nn.Linear(2*embed_dim, 3*embed_dim),
                                       nn.ReLU(),
                                       nn.Linear(3*embed_dim, 2*embed_dim),
                                       nn.ReLU(),
                                       nn.Linear(2*embed_dim, embed_dim)
                                       )
        self.branch = branch
        self.resblocks = nn.ModuleList(
            [
                ResidualCrossAttentionBlock(width=embed_dim, heads=num_heads, dropout=dropout)
                for _ in range(cross_attn_layers)
            ]
        )
        self.output_proj = nn.Sequential(nn.Linear(embed_dim, 2*embed_dim),
                                         nn.ReLU(), nn.Dropout(dropout),
                                         nn.Linear(2*embed_dim, 3*embed_dim),
                                         nn.ReLU(), nn.Dropout(dropout),
                                         nn.Linear(3*embed_dim, 3*embed_dim),
                                         nn.ReLU(), nn.Dropout(dropout),
                                         nn.Linear(3*embed_dim, 2*embed_dim),
                                         nn.ReLU(), nn.Dropout(dropout),
                                         nn.Linear(2*embed_dim, out_channels)
                                         )

        # --- UPGRADE: Accepts our 9-value boundary vector ---
        self.loading_encoder = nn.Sequential(nn.Linear(9, 2*embed_dim),
                                             nn.SiLU(),
                                             nn.Linear(2*embed_dim, 2*embed_dim),
                                             nn.SiLU(),
                                             nn.Linear(2*embed_dim, embed_dim),
                                             nn.SiLU()
                                             )
        
        self.latent_encoder = nn.Sequential(nn.Linear(2*embed_dim, 2*embed_dim),
                                            nn.SiLU(),
                                            nn.Linear(2*embed_dim, embed_dim),
                                            nn.SiLU()
                                            )

    def forward(self, load, xyt, pc, sample_ids=None):
        # 1. Compress the 9 values -> [B, embed_dim]
        load = self.loading_encoder(load) 
        
        # 2. Compress the 100k point cloud -> [B, 512, embed_dim]
        latent = self.branch(pc, sample_ids=sample_ids) 
        
        # 3. Expand the 9 values and attach them to EVERY latent token!
        B, np, _ = latent.shape
        load = load.view(B, 1, -1).expand(-1, np, -1) 
        
        # Merge and finalize -> [B, 512, 2*embed_dim] becomes [B, 512, embed_dim]
        latent = torch.cat([latent, load], dim=-1)
        latent = self.latent_encoder(latent)
        
        # Standard Cross-Attention execution
        xyt = encode_position('nerf', position=xyt)
        x = self.Q_encoder(xyt)
        for block in self.resblocks:
            x = block(x, latent)  
        x = self.output_proj(x)
        return x

# In[10]:
def NOTModelDefinition(branch_args, trunc_args):
    branch = PointCloudPerceiverChannelsEncoder(**branch_args)
    tot_num_params = sum(p.numel() for p in branch.parameters())
    trainable_params = sum(p.numel()
                           for p in branch.parameters() if p.requires_grad)
    print(
        f"Total number of parameters of Geo encoder: {tot_num_params}, {trainable_params} of which are trainable")
    trunk = Trunk(branch, **trunc_args)
    tot_num_params = sum(p.numel() for p in trunk.parameters())
    trainable_params = sum(p.numel()
                           for p in trunk.parameters() if p.requires_grad)
    print(
        f"Total number of parameters of NOT model: {tot_num_params}, {trainable_params} of which are trainable")

    return trunk

# In[11]:
import torch

# 1. Instantiate the untrained architectures
args_all = configs.LUG_GINOT_configs()
branch_args = args_all["branch_args"]
trunk_args = args_all["trunk_args"]

trunk_args["out_channels"] = 4
branch_args["radius"] = 0.2
trunk_args["cross_attn_layers"] = 5   # Increased from 3 to 5 for better spatial mapping

ginot_model = NOTModelDefinition(branch_args, trunk_args)
ginot_model = ginot_model.to(device)


# 2. Load the trained weights into the models
ginot_model.load_state_dict(torch.load("/kaggle/input/notebooks/neodecade/ginot-train/ginot_trained_multicase.pth", map_location=device))



# 4. Run Model Inference
# 
# Once the data is formatted, pass it into the loaded GINOT model. Make sure all tensors are pushed to the target device (cuda or cpu).

# In[12]:
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

ginot_model.eval()
with torch.no_grad():
    predictions = ginot_model(
        load=load.to(device), 
        xyt=xyt.to(device), 
        pc=pc.to(device)
    )

# The output represents the predicted airflow fields (U, V, W, p) at the `xyt` points

# In[13]:
import numpy as np
import plotly.graph_objects as go

# 1. Extract data from PyTorch tensors
# Assuming 'predictions' shape is [1, N, 4] containing (U, V, W, pressure)
# and 'xyt' shape is [1, N, 3] containing (X, Y, Z)
preds_np = predictions.squeeze(0).cpu().numpy()
coords_np = xyt.squeeze(0).cpu().numpy()

# Denormalize coordinates to match the original room scale for the app UI
original_coords = (coords_np * scale) + center

# 2. Calculate Velocity Magnitude (Speed)
u = preds_np[:, 0]
v = preds_np[:, 1]
w = preds_np[:, 2]
# p = preds_np[:, 3] # Pressure can be extracted here if needed for another view

speed = np.sqrt(u**2 + v**2 + w**2)

# 3. Create an Interactive 3D Scatter Plot using Plotly
# This figure can be easily exported to HTML or integrated into front-end frameworks
fig = go.Figure(data=[go.Scatter3d(
    x=original_coords[:, 0],
    y=original_coords[:, 1],
    z=original_coords[:, 2],
    mode='markers',
    marker=dict(
        size=3,            # Adjust point size based on your app's rendering needs
        color=speed,       # Set color to velocity magnitude
        colorscale='Jet',  # Standard colormap for CFD visualization
        opacity=0.6,
        colorbar=dict(title="Velocity Magnitude (m/s)")
    ),
    text=[f"Speed: {s:.2f} m/s" for s in speed], # Hover info
    hoverinfo="text"
)])

# 4. Configure Layout
fig.update_layout(
    title='3D Indoor Airflow Prediction',
    scene=dict(
        xaxis_title='X (m)',
        yaxis_title='Y (m)',
        zaxis_title='Z (m)',
        aspectmode='data' # Ensures the room's proportions aren't distorted
    ),
    margin=dict(l=0, r=0, b=0, t=40)
)



# Display the plot
fig.show()

# To save this for a web app frontend:
# fig.write_html("airflow_prediction_view.html")
# Or return it as JSON to a frontend via an API:
# json_data = fig.to_json()

# In[14]:
