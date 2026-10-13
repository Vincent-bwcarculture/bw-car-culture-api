import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const slugifyNewsTitle = title => String(title || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 140).replace(/^-+|-+$/g, '') || 'article';

export const newsSlug = article => article.slug || `${slugifyNewsTitle(article.title)}-${article._id}`;
export const newsGallery = article => {
  const images = [article.gallery, article.galleryImages, article.images].filter(Array.isArray).flat();
  const seen = new Set();
  return images.filter(image => {
    const key = typeof image === 'string' ? image : image?.url || image?.secure_url || image?.key || image?.path;
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
};
export const publicNewsArticle = article => ({ ...article, _id: String(article._id), slug: newsSlug(article), gallery: newsGallery(article) });

export async function readNewsRequest(req) {
  const type = req.headers['content-type'] || '';
  const files = { featuredImage: null, galleryImages: [] };
  if (type.includes('application/json') && req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return { data: req.body, files };
  }
  const chunks = [];
  if (Buffer.isBuffer(req.body) || typeof req.body === 'string') chunks.push(Buffer.from(req.body));
  else for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks);
  if (!raw.length) throw new Error('Empty article request');
  if (type.includes('application/json')) return { data: JSON.parse(raw.toString('utf8')), files };
  const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(type);
  if (!type.includes('multipart/form-data') || !boundary) throw new Error('Invalid article upload format');
  const data = {};
  for (const part of raw.toString('latin1').split(`--${boundary[1] || boundary[2]}`)) {
    const split = part.indexOf('\r\n\r\n'); if (split < 0) continue;
    const headers = part.slice(0, split);
    const name = /\bname="([^"]+)"/i.exec(headers)?.[1]; if (!name) continue;
    const payload = Buffer.from(part.slice(split + 4).replace(/\r\n$/, ''), 'latin1');
    const filename = /\bfilename="([^"]*)"/i.exec(headers)?.[1];
    if (filename !== undefined) {
      if (!filename) continue;
      const mimetype = /Content-Type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || '';
      if (!mimetype.startsWith('image/') || !payload.length) throw new Error('Article photos must be non-empty image files');
      const file = { filename, mimetype, buffer: payload };
      if (name === 'featuredImage') files.featuredImage = file;
      else if (['gallery', 'galleryImages', 'galleryImages[]', 'images'].includes(name)) files.galleryImages.push(file);
      else throw new Error(`Unsupported article image field: ${name}`);
    } else {
      let value = payload.toString('utf8');
      if (['gallery', 'existingGallery', 'tags', 'seo'].includes(name)) {
        try { value = JSON.parse(value); } catch { if (name === 'tags') value = value.split(',').map(tag => tag.trim()).filter(Boolean); }
      }
      if (name === 'featuredImage' && value === 'null') value = null;
      data[name] = value;
    }
  }
  return { data, files };
}

export async function uploadNewsImages(files, userId) {
  const result = { gallery: [] };
  if (!files.featuredImage && !files.galleryImages.length) return result;
  const bucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
  const region = process.env.AWS_S3_REGION || 'us-east-1';
  const s3 = new S3Client({ region, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } });
  const upload = async (file, label) => {
    const extension = /\.([a-z0-9]{1,5})$/i.exec(file.filename)?.[1]?.toLowerCase() || 'jpg';
    const key = `articles/${userId}/${label}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: file.buffer, ContentType: file.mimetype }));
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  };
  if (files.featuredImage) result.featuredImage = await upload(files.featuredImage, 'featured');
  for (const [index, file] of files.galleryImages.entries()) result.gallery.push(await upload(file, `gallery-${index}`));
  return result;
}
