"""Jonsered iZ.18R HD (100) – split the 1-mesh SolidWorks GLB into kinematic groups (connectivity + planes from drawing 465-1037)."""
import trimesh,numpy as np,json,collections
from rot import R, XA, ZA
m=trimesh.load('all.glb',force='mesh'); lab=np.load('lab.npy'); F=m.faces; V0=m.vertices; VR=R(V0)
order=np.argsort(lab,kind='stable'); ls=lab[order]; cuts=np.flatnonzero(np.diff(ls))+1
groups=np.split(order,cuts)
MOUNT=0.034
P1=np.array([0.233,2.483]); P2=np.array([-1.414,-0.359]); TOP=np.array([-0.595,2.733])
um=(P2-P1)/np.linalg.norm(P2-P1); nm=np.array([-um[1],um[0]]); Lm=np.linalg.norm(P2-P1)
uo=(TOP-P2)/np.linalg.norm(TOP-P2); no=np.array([-uo[1],uo[0]])
EXT1_Z,EXT2_Z=0.080,0.066  # nested profile half-widths (measured: outer ±0.116, ext1 ±0.078, ext2 ±0.064)
OUTER_END,EXT1_END=2.71,2.925
cls=np.empty(len(groups),dtype=object)
for i,g in enumerate(groups):
  vi=np.unique(F[g].ravel()); P=V0[vi]; Q=VR[vi]; mn,mx=P.min(0),P.max(0); c=(mn+mx)/2
  # --- outriggers (unrotated GLB frame: stab beams along X) ---
  if mx[1]<0.30 and abs(c[2])<0.075 and (mn[0]>0.10 or mx[0]<-0.10) and mx[1]>-0.2:
    side='R' if c[0]>0 else 'L'
    cls[i]='stab'+side; continue
  if abs(abs(c[0])-1.116)<0.17 and c[1]<0.35 and abs(c[2])<0.25:
    side='R' if c[0]>0 else 'L'
    cls[i]=('leg' if mx[1]<-0.05 or c[1]<-0.3 else 'stab')+side; continue
  q=Q[:,:2]; cq=(q.min(0)+q.max(0))/2; zq=Q[:,2]
  if mx[1]>0.6 or c[1]>0.62:
    a=(q-P2)@uo; p=(q-P2)@no
    ta=(cq-P1)@um; dm=abs((cq-P1)@nm)
    inOuter=a.min()>-0.25 and a.max()<3.35 and np.abs(p).max()<0.40 and np.abs(zq).max()<0.16
    inMain=-0.1<ta<Lm+0.25 and dm<0.30 and np.abs(zq).max()<0.30
    if inOuter and (a.min()>0.12 or not inMain):
      zm=np.abs(zq).max()
      if a.min()>EXT1_END-0.02 or (zm<=EXT2_Z and a.min()>0.6): cls[i]='ext2'
      elif a.min()>OUTER_END-0.02 or (zm<=EXT1_Z and a.min()>0.4): cls[i]='ext1'
      else: cls[i]='outer'
    elif inMain: cls[i]='main'
    else: cls[i]='column'
  else:
    a=(q-P2)@uo; ta=(cq-P1)@um; dm=abs((cq-P1)@nm)
    if np.linalg.norm(cq-P2)<0.45 and abs(c[2]-(-0.44))<0.3:
      cls[i]='outer' if a.min()>0.12 else 'main'
    elif -0.1<ta<Lm+0.25 and dm<0.30 and abs(c[2]+0.44)<0.35: cls[i]='main'
    else: cls[i]='base'
cnt=collections.Counter(cls); print(cnt)
# mesh frame: X lateral (= z'), Y up (y - MOUNT), Z = r (= -x'); base without the 4.5° boom-plane slew
def frame(P,rot):
  if rot: Q=R(P)
  else: return np.c_[P[:,0]-XA,P[:,1]-MOUNT,P[:,2]-ZA]
  return np.c_[Q[:,2],Q[:,1]-MOUNT,-Q[:,0]]
sc=trimesh.Scene()
for name in ['base','stabL','stabR','legL','legR','column','main','outer','ext1','ext2']:
  idx=np.concatenate([groups[i] for i in np.flatnonzero(cls==name)]) if (cls==name).any() else None
  if idx is None: continue
  fs=F[idx]; vi,inv=np.unique(fs.ravel(),return_inverse=True)
  rot=name not in('base','stabL','stabR','legL','legR')
  mesh=trimesh.Trimesh(frame(V0[vi],rot),inv.reshape(-1,3),process=False)
  sc.graph.update(frame_from='world',frame_to=name,matrix=np.eye(4))
  sc.add_geometry(mesh,geom_name=name+'_m',node_name=name+'_m',parent_node_name=name)
  print(name,len(fs),(mesh.bounds*1000).round(0).tolist())
sc.export('jonsered-iz18r-articulated.glb')
np.save('cls.npy',cls)
