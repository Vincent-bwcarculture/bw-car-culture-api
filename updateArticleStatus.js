// updateArticleStatus.js
// Run this script to update your article's status to 'published'

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  dbName: process.env.MONGODB_NAME || 'i3wcarculture'
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Simple News schema
const NewsSchema = new mongoose.Schema({
  title: String,
  status: String,
  featured: Boolean,
  publishDate: Date
}, { 
  strict: false, // Allow fields not in schema
  timestamps: true 
});

const News = mongoose.model('news', NewsSchema);

// Function to update all draft articles to published
const updateArticleStatus = async () => {
  try {
    // Find all draft articles
    const draftArticles = await News.find({ status: 'draft' });
    console.log(`Found ${draftArticles.length} draft articles`);
    
    if (draftArticles.length === 0) {
      console.log('No draft articles found to update');
      return;
    }
    
    // Update articles to published and featured
    for (const article of draftArticles) {
      console.log(`Updating article: ${article.title}`);
      
      article.status = 'published';
      article.featured = true;
      
      // Set publish date to now if not set
      if (!article.publishDate) {
        article.publishDate = new Date();
      }
      
      await article.save();
      console.log(`✅ Updated successfully!`);
    }
    
    // Verify the updates
    const publishedArticles = await News.find({ status: 'published' });
    console.log(`\nNow have ${publishedArticles.length} published articles`);
    
    // Show the articles
    console.log('\nPublished articles:');
    publishedArticles.forEach((article, index) => {
      console.log(`${index + 1}. ${article.title} (${article.featured ? 'Featured' : 'Not Featured'})`);
    });
  } catch (error) {
    console.error('Error updating articles:', error);
  } finally {
    mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
};

// Run the update function
updateArticleStatus();