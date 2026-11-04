export async function captureProfilePhoto(): Promise<string | null> {
  if (!navigator.mediaDevices?.getUserMedia) throw Error('Camera access requires HTTPS or localhost and a browser with camera support.');
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }); }
  catch { throw Error('Could not open your camera. Allow camera access in browser permissions and check that a camera is connected.'); }
  return new Promise((resolve, reject) => {
    const previous = document.activeElement as HTMLElement | null;
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'Take profile photo');
    Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2147483647', background: '#000B', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' });
    const panel = document.createElement('div');
    Object.assign(panel.style, { background: 'white', borderRadius: '16px', padding: '20px', width: '100%', maxWidth: '440px' });
    const video = document.createElement('video'); video.autoplay = true; video.muted = true; video.playsInline = true; video.srcObject = stream;
    Object.assign(video.style, { width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '12px' });
    const take = document.createElement('button'); take.textContent = 'Capture photo'; take.disabled = true;
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel';
    for (const button of [take, cancel]) { button.type = 'button'; Object.assign(button.style, { padding: '12px 18px', margin: '12px 8px 0 0', border: '1px solid #C05A52', borderRadius: '8px', cursor: 'pointer' }); }
    take.style.background = '#C05A52'; take.style.color = 'white';
    const cleanup = () => { stream.getTracks().forEach(track => track.stop()); video.srcObject = null; overlay.remove(); window.removeEventListener('pagehide', close); document.removeEventListener('keydown', keydown); previous?.focus(); };
    const close = () => { cleanup(); resolve(null); };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') { event.preventDefault(); (document.activeElement === cancel && !take.disabled ? take : cancel).focus(); }
    };
    video.onloadeddata = () => { take.disabled = false; };
    video.onerror = () => { cleanup(); reject(Error('Could not display the camera preview.')); };
    cancel.onclick = close;
    take.onclick = () => {
      try {
        const canvas = document.createElement('canvas'); const side = Math.min(video.videoWidth, video.videoHeight);
        if (!side) throw Error('Wait for the camera preview before taking a photo.');
        canvas.width = canvas.height = Math.min(side, 1024);
        const context = canvas.getContext('2d'); if (!context) throw Error('Could not capture the photo.');
        context.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
        const image = canvas.toDataURL('image/jpeg', 0.85); cleanup(); resolve(image);
      } catch (error) { cleanup(); reject(error); }
    };
    panel.append(video, take, cancel); overlay.append(panel); document.body.append(overlay); cancel.focus();
    document.addEventListener('keydown', keydown); window.addEventListener('pagehide', close);
    void video.play().catch(() => { cleanup(); reject(Error('Could not start the camera preview.')); });
  });
}
