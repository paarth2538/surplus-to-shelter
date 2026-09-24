import { supabase } from './supabase';

export async function uploadProof(file, pickupId, type) {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (!file || !pickupId || !type) throw new Error('A proof file, pickup, and type are required.');

  const extension = file.type === 'image/png' ? 'png' : 'webp';
  const path = `${pickupId}/${type}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from('pickup-proofs')
    .upload(path, file, { contentType: file.type || 'image/webp', upsert: false });

  if (error) throw error;
  const { data } = supabase.storage.from('pickup-proofs').getPublicUrl(path);
  return data.publicUrl;
}

export function dataUrlToBlob(dataUrl) {
  const [metadata, encoded] = dataUrl.split(',');
  const mime = metadata.match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}