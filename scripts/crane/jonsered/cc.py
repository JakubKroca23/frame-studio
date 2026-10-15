import trimesh,numpy as np,pickle
s=trimesh.load('/workspace/trw-inputs/jonsered-iz18r/08e783306df17a1ed08ad4b0813c1a819d984b9c7ae59fcdcd12eb473d24b0cc.glb')
print(s.bounds, len(s.graph.nodes_geometry))
m=s.dump(concatenate=True); print(len(m.vertices),len(m.faces))
m.merge_vertices()
lab=trimesh.graph.connected_component_labels(m.face_adjacency,node_count=len(m.faces))
np.save('/workspace/jons/lab.npy',lab); m.export('/workspace/jons/all.glb')
n=lab.max()+1; print('components',n)
fc=m.triangles_center
rows=[]
for i in range(n):
  f=np.where(lab==i)[0]; v=m.faces[f].ravel(); P=m.vertices[v]; rows.append((len(f),P.min(0),P.max(0)))
pickle.dump(rows,open('/workspace/jons/cc.pkl','wb'))
for r in sorted(rows,key=lambda t:-t[0])[:40]: print(r[0],r[1].round(2),r[2].round(2))
