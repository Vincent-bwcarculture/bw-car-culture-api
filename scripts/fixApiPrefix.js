// scripts/fixApiPrefix.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import News from '../models/News.js';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Get database connection string from environment variables
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_NAME = process.env.MONGODB_NAME;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in environment variables. Please set it in your .env file.');
  process.exit(1);
}

if (!MONGODB_NAME) {
  console.error('MONGODB_NAME is not defined in environment variables. Please set it in your .env file.');
  process.exit(1);
}

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  dbName: MONGODB_NAME
}).then(() => {
  console.log('Connected to MongoDB');
  fixApiPrefix();
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

const fixApiPrefix = async () => {
  try {
    const articles = await News.find();
    console.log(`Found ${articles.length} articles`);
    for (const article of articles) {
      let updated = false;
      if (article.gallery && Array.isArray(article.gallery)) {
        article.gallery = article.gallery.map(image => {
          if (typeof image === 'string') {
            const newPath = image.replace('/api/', '/');
            if (newPath !== image) updated = true;
            return newPath;
          } else if (image && typeof image === 'object' && image.url) {
            const newUrl = image.url.replace('/api/', '/');
            const newThumbnail = image.thumbnail
              ? image.thumbnail.replace('/api/', '/')
              : newUrl;
            if (newUrl !== image.url || newThumbnail !== image.thumbnail) updated = true;
            return { ...image, url: newUrl, thumbnail: newThumbnail };
          }
          return image;
        });
      }
      if (article.featuredImage?.url) {
        const newUrl = article.featuredImage.url.replace('/api/', '/');
        const newThumbnail = article.featuredImage.thumbnail
          ? article.featuredImage.thumbnail.replace('/api/', '/')
          : newUrl;
        if (newUrl !== article.featuredImage.url || newThumbnail !== article.featuredImage.thumbnail) {
          updated = true;
          article.featuredImage.url = newUrl;
          article.featuredImage.thumbnail = newThumbnail;
        }
      }
      if (updated) {
        await article.save();
        console.log(`Updated article ${article._id}`);
      }
    }
    console.log('API prefix migration completed');
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    mongoose.connection.close();
    console.log('Database connection closed');
  }
};

fixApiPrefix();