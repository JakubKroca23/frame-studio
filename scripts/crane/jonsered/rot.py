import numpy as np
XA,ZA=0.335,-0.325; K=0.079; c=1/np.sqrt(1+K*K)
def R(P):
  P=np.asarray(P,float); x=P[...,0]-XA; z=P[...,2]-ZA
  return np.stack([(x+K*z)*c, P[...,1], (z-K*x)*c],-1)
