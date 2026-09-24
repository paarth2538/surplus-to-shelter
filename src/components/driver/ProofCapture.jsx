import React, { useEffect, useRef, useState } from 'react';
import { dataUrlToBlob, uploadProof } from '../../lib/storage';

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.82;
      const encode = () => canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Unable to compress the proof photo.'));
        if (blob.size <= 1024 * 1024 || quality <= 0.35) return resolve(blob);
        quality -= 0.1;
        encode();
      }, 'image/webp', quality);
      encode();
    };
    image.onerror = () => reject(new Error('Unable to read the proof photo.'));
    image.src = objectUrl;
  });
}

export default function ProofCapture({ pickupId, type, onComplete, onError }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#0f172a';
    context.lineWidth = 2;
    context.lineCap = 'round';
  }, []);

  const pointForEvent = (event) => {
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    const touch = event.touches?.[0] || event;
    return {
      x: (touch.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (touch.clientY - bounds.top) * (canvas.height / bounds.height)
    };
  };

  const startDrawing = (event) => {
    event.preventDefault();
    const point = pointForEvent(event);
    const context = canvasRef.current.getContext('2d');
    context.beginPath();
    context.moveTo(point.x, point.y);
    drawingRef.current = true;
  };

  const draw = (event) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const point = pointForEvent(event);
    const context = canvasRef.current.getContext('2d');
    context.lineTo(point.x, point.y);
    context.stroke();
    setHasSignature(true);
  };

  const finishDrawing = () => { drawingRef.current = false; };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSubmit = async () => {
    if (!photoFile || !hasSignature) {
      onError?.(new Error('Add a photo and signature before continuing.'));
      return;
    }
    setUploading(true);
    try {
      const compressedPhoto = await compressImage(photoFile);
      const photoUrl = await uploadProof(compressedPhoto, pickupId, `${type}-photo`);
      const signatureBlob = dataUrlToBlob(canvasRef.current.toDataURL('image/png'));
      const signatureUrl = await uploadProof(signatureBlob, pickupId, `${type}-signature`);
      onComplete?.({ photoUrl, signatureUrl });
    } catch (uploadError) {
      onError?.(uploadError);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="proof-capture">
      <label className="proof-file-input">
        <span>{photoFile ? `Photo ready: ${photoFile.name}` : 'Capture cargo photo'}</span>
        <input type="file" accept="image/*" capture="environment" onChange={(event) => setPhotoFile(event.target.files?.[0] || null)} />
      </label>
      <div className="signature-field">
        <div className="signature-field-heading"><span>Signature</span><button type="button" onClick={clearSignature}>Clear</button></div>
        <canvas ref={canvasRef} width="640" height="220" onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={finishDrawing} onMouseLeave={finishDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={finishDrawing} aria-label="Signature pad" />
      </div>
      <button type="button" className="btn-pill-primary proof-submit-button" onClick={handleSubmit} disabled={uploading}>{uploading ? 'Uploading proof...' : 'Save proof'}</button>
    </div>
  );
}