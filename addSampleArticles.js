// addSampleArticles.js - Run this script to populate your database with articles
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Define the News schema
const NewsSchema = new mongoose.Schema({
  title: String,
  subtitle: String,
  content: mongoose.Schema.Types.Mixed,
  authorName: String,
  category: String,
  tags: [String],
  gallery: Array,
  status: { type: String, default: 'published' },
  publishDate: { type: Date, default: Date.now },
  featured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  slug: String
});

const News = mongoose.model('news', NewsSchema);

// Sample articles
const sampleArticles = [
  {
    title: "The High-performance GR Supra A90 Final Edition",
    subtitle: "Toyota's last hurrah for the Supra delivers stunning performance",
    content: { introduction: "It was yet one of those, the most controversial cars when launched..." },
    authorName: "Admin User",
    category: "car-review",
    tags: ["Toyota", "Supra", "Sports Car", "GR"],
    featured: true,
    slug: "high-performance-gr-supra-a90-final-edition"
  },
  {
    title: "2024 Nissan GT-R Review",
    subtitle: "Godzilla returns with subtle yet meaningful updates",
    content: { introduction: "The iconic Godzilla returns with subtle updates..." },
    authorName: "Admin User",
    category: "car-review",
    tags: ["Nissan", "GT-R", "Sports Car", "Review"],
    featured: false,
    slug: "2024-nissan-gtr-review"
  }
];

// Function to add sample articles
const addSampleArticles = async () => {
  try {
    const count = await News.countDocuments();
    console.log(`Found ${count} existing articles in the database`);

    if (count > 0) {
      console.log('Database already has articles, checking if our sample articles exist...');

      const existingTitles = await News.find({ title: { $in: sampleArticles.map(a => a.title) } }).select('title');
      console.log(`Found ${existingTitles.length} of our sample articles already in the database`);

      const titlesToAdd = sampleArticles.filter(article => 
        !existingTitles.some(existing => existing.title === article.title)
      );

      if (titlesToAdd.length === 0) {
        console.log('All sample articles already exist, no new articles to add');
        return;
      }

      console.log(`Adding ${titlesToAdd.length} new sample articles`);
      const result = await News.insertMany(titlesToAdd);
      console.log(`Successfully added ${result.length} new articles`);
    } else {
      console.log('Database is empty, adding all sample articles');
      const result = await News.insertMany(sampleArticles);
      console.log(`Successfully added ${result.length} articles to the empty database`);
    }

    const allArticles = await News.find().select('title featured category');
    console.log('\nAll articles in database:');
    allArticles.forEach((article, index) => {
      console.log(`${index + 1}. ${article.title} ${article.featured ? '(Featured)' : ''} - ${article.category}`);
    });
  } catch (error) {
    console.error('Error adding sample articles:', error);
  } finally {
    mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
};

// Run the function
addSampleArticles();
