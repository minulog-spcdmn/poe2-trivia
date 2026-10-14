"""grab.py video.mp4 out.jpg offset t1 t2 ... : a sheet of frames at trailer times (offset = video start time)."""
import sys, subprocess, numpy as np, cv2, os
vid, out, off = sys.argv[1], sys.argv[2], float(sys.argv[3]); ts = [float(x) for x in sys.argv[4:]]
FF = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bin', 'ffmpeg.exe')
ims = []
for t in ts:
    p = subprocess.run([FF, '-loglevel', 'error', '-ss', f'{t - off:.3f}', '-i', vid, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True)
    im = cv2.imdecode(np.frombuffer(p.stdout, np.uint8), cv2.IMREAD_COLOR)
    im = cv2.resize(im, (640, 360)); cv2.putText(im, f'{t:.2f}', (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
    ims.append(im)
cols = 4
while len(ims) % cols: ims.append(np.zeros_like(ims[0]))
rows = [np.hstack(ims[i:i + cols]) for i in range(0, len(ims), cols)]
cv2.imwrite(out, np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 85])
