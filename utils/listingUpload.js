import { createHash, randomUUID } from 'node:crypto';
const error = (message, status = 400) => Object.assign(new Error(message), { status });
export async function readListingUpload(req) {
  const type = req.headers['content-type'] || '';
  const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(type);
  if (!boundary || !type.includes('multipart/form-data')) throw error('Please select your photos again and retry.');
  const chunks = []; let size = 0;
  const add = chunk => {
    size += chunk.length;
    if (size > 4 * 1024 * 1024 + 65536) throw error('The upload is too large. Please use a smaller file.', 413);
    chunks.push(Buffer.from(chunk));
  };
  if (Buffer.isBuffer(req.body) || typeof req.body === 'string') add(Buffer.from(req.body));
  else for await (const chunk of req) add(chunk);
  const fields = {}, files = [];
  for (const part of Buffer.concat(chunks).toString('latin1').split(`\r\n--${boundary[1] || boundary[2]}`)) {
    const split = part.indexOf('\r\n\r\n'); if (split < 0) continue;
    const headers = part.slice(0, split);
    const name = /\bname="([^"]+)"/i.exec(headers)?.[1];
    if (!name) continue;
    const payload = Buffer.from(part.slice(split + 4), 'latin1');
    const filename = /\bfilename="([^"]*)"/i.exec(headers)?.[1];
    if (filename) files.push({ filename, buffer: payload, mimetype: /Content-Type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim().toLowerCase() });
    else fields[name] = payload.toString('utf8');
  }
  if (!files.length || files.length > 15) throw error('Please select between 1 and 15 photos.');
  const folder = ['user-listings', 'inventory', 'boost-payment-proofs'].includes(fields.folder) ? fields.folder : 'user-listings';
  for (const file of files) {
    if (!file.buffer.length || file.buffer.length > 4 * 1024 * 1024) throw error('Please use a file under 4MB.', 413);
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.mimetype) && !(folder === 'boost-payment-proofs' && file.mimetype === 'application/pdf')) {
      throw error('Use JPEG, PNG or WebP photos. Payment proof may also be a PDF.', 415);
    }
  }
  return { files, folder, uploadId: /^[\w-]{8,80}$/.test(fields.uploadId || '') ? fields.uploadId : randomUUID() };
}
export async function storeListingUpload(parsed, userId, putObject) {
  const bucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
  const region = process.env.AWS_S3_REGION || 'us-east-1';
  if (!putObject) {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) throw error('Photo storage is temporarily unavailable. Please retry shortly.', 503);
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({ region, maxAttempts: 2 });
    const signal = AbortSignal.timeout(15000);
    putObject = params => client.send(new PutObjectCommand(params), { abortSignal: signal });
  }
  const images = [];
  for (const [index, file] of parsed.files.entries()) {
    const extension = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[file.mimetype];
    const hash = createHash('sha256').update(file.buffer).digest('hex').slice(0, 20);
    const key = `${parsed.folder}/${encodeURIComponent(userId)}/${parsed.uploadId}-${index}-${hash}.${extension}`;
    await putObject({ Bucket: bucket, Key: key, Body: file.buffer, ContentType: file.mimetype,
      Metadata: { userId: String(userId), uploadType: parsed.folder }, CacheControl: 'public, max-age=31536000, immutable' });
    images.push({ url: `https://${bucket}.s3.${region}.amazonaws.com/${key}`, key, size: file.buffer.length,
      mimetype: file.mimetype, isPrimary: index === 0, originalFilename: file.filename });
  }
  return images;
}
export async function handleListingUpload(req, res, verifyUserToken) {
  const auth = await verifyUserToken(req);
  if (!auth.success) return res.status(401).json({ success: false, message: 'Please log in again before uploading.' });
  try {
    const parsed = await readListingUpload(req);
    const images = await storeListingUpload(parsed, auth.user.id);
    return res.status(200).json({ success: true, images, count: images.length });
  } catch (err) {
    console.error('[listing-upload]', err.name, err.message);
    return res.status(err.status || 503).json({ success: false, message: err.status ? err.message : 'Photo storage did not finish the upload. Please retry; your selected photos are retained.' });
  }
}
