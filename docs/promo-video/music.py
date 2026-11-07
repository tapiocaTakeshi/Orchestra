import numpy as np, wave
SR=44100; DUR=53.5; N=int(SR*DUR); t=np.arange(N)/SR
out=np.zeros(N); BEAT=0.5
def note(m): return 440*2**((m-69)/12)
prog=[[57,60,64],[53,57,60],[48,52,55],[55,59,62]]  # Am F C G
def env(n,a,r):
    e=np.ones(n); a=min(a,n); r=min(r,n)
    e[:a]=np.linspace(0,1,a); e[n-r:]*=np.linspace(1,0,r); return e
# pad
for i in range(int(DUR/4)+1):
    s=int(i*4*SR); n=min(int(4.6*SR),N-s)
    if n<=0: break
    tt=np.arange(n)/SR; seg=np.zeros(n)
    for m in prog[i%4]:
        for det in (-0.08,0.08):
            f=note(m)*2**(det/12)
            seg+=np.sin(2*np.pi*f*tt)+0.3*np.sin(2*np.pi*2*f*tt)+0.12*np.sin(2*np.pi*3*f*tt)
    seg+=1.2*np.sin(2*np.pi*note(prog[i%4][0]-12)*tt)
    out[s:s+n]+=0.045*seg*env(n,int(1.2*SR),int(1.5*SR))
# arpeggio (from 5s)
pattern=[0,1,2,1,2,0,1,2]
for k in range(int((DUR-5)/(BEAT/2))):
    st=5+k*BEAT/2; ch=prog[int(st//4)%4]; m=ch[pattern[k%8]]+12+(12 if k%16>=12 else 0)
    s=int(st*SR); n=min(int(0.6*SR),N-s); tt=np.arange(n)/SR
    out[s:s+n]+=0.06*(np.sin(2*np.pi*note(m)*tt)+0.2*np.sin(2*np.pi*2*note(m)*tt))*np.exp(-tt*7)*env(n,80,200)
# kick + hat from 11s to 46s
for k in range(int((46-11)/BEAT)):
    st=11+k*BEAT; s=int(st*SR); n=min(int(0.35*SR),N-s); tt=np.arange(n)/SR
    f=50+90*np.exp(-tt*30); out[s:s+n]+=0.32*np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-tt*9)
    hs=int((st+BEAT/2)*SR); hn=min(int(0.05*SR),N-hs)
    if hn>0: out[hs:hs+hn]+=0.025*np.random.randn(hn)*np.exp(-np.arange(hn)/SR*80)
# whoosh hits at scene changes
for st in [5,11,19,27,34,41,47]:
    s=int((st-0.5)*SR); n=int(0.7*SR); tt=np.arange(n)/SR
    nz=np.convolve(np.random.randn(n),np.ones(30)/30,'same')
    out[s:s+n]+=0.08*nz*np.sin(np.pi*tt/0.7)**2
# final chord swell
s=int(47*SR); n=N-s; tt=np.arange(n)/SR; seg=np.zeros(n)
for m in [45,57,60,64,69]: seg+=np.sin(2*np.pi*note(m)*tt)
out[s:]+=0.05*seg*env(n,int(0.05*SR),int(4*SR))
out*=env(N,int(0.8*SR),int(2.5*SR))
out/=np.max(np.abs(out))*1.15
st=np.stack([out,np.roll(out,220)],1)
with wave.open('music.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st*32767).astype('<i2').tobytes())
print('ok')
