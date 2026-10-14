import re, numpy as np
s=open('u21/3D/3dmodel.model').read()
v=np.array(re.findall(r'<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"',s),dtype=np.float32)
t=np.array(re.findall(r'<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"',s),dtype=np.uint32)
print(v.shape,t.shape,v.min(0),v.max(0))
np.save('u21_v.npy',v); np.save('u21_t.npy',t)
