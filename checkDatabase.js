// server/checkDatabase.js
// This script checks and fixes database connection issues

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_NAME || 'i3wcarculture'; // Explicitly set DB name

// Connect with detailed logging
console.log('=== DATABASE CONNECTION CHECK ===');
console.log(`Attempting to connect to: ${MONGODB_URI?.replace(/:([^:@]+)@/, ':****@') || 'No URI defined'}`);
console.log(`Using database name: ${DB_NAME}`);

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  dbName: DB_NAME // Explicitly set database name
})
.then(async (connection) => {
  console.log('✅ MongoDB Connected Successfully!');
  console.log(`Connected to host: ${connection.connection.host}`);
  console.log(`Connected to database: ${connection.connection.db.databaseName}`);
  
  try {
    // List all collections
    const collections = await connection.connection.db.listCollections().toArray();
    console.log('\n📋 Available collections:');
    collections.forEach(collection => {
      console.log(`- ${collection.name}`);
    });
    
    // Check if news collection exists
    const newsCollection = collections.find(c => c.name === 'news');
    if (!newsCollection) {
      console.log('\n❌ The "news" collection does not exist!');
      console.log('This explains why no articles are being found.');
    } else {
      console.log('\n✅ The "news" collection exists.');
      
      // Count documents
      const count = await connection.connection.db.collection('news').countDocuments();
      console.log(`📊 Total documents in news collection: ${count}`);
      
      if (count === 0) {
        console.log('❌ The news collection is empty!');
      } else {
        // Show sample document
        const sampleDoc = await connection.connection.db.collection('news').findOne();
        console.log('\n📄 Sample document:');
        console.log(JSON.stringify(sampleDoc, null, 2));
        
        // Try a simple query
        const query = {};
        const results = await connection.connection.db.collection('news').find(query).limit(10).toArray();
        console.log(`\n🔍 Simple query returned ${results.length} documents`);
        
        if (results.length > 0) {
          console.log('Document titles:');
          results.forEach((doc, index) => {
            console.log(`${index + 1}. ${doc.title || 'No title'}`);
          });
          
          // Check if documents have expected fields
          const missingFields = [];
          const expectedFields = ['title', 'content', 'category', 'slug'];
          
          for (const field of expectedFields) {
            if (results.some(doc => doc[field] === undefined)) {
              missingFields.push(field);
            }
          }
          
          if (missingFields.length > 0) {
            console.log(`\n⚠️ Some documents are missing expected fields: ${missingFields.join(', ')}`);
          } else {
            console.log('\n✅ All documents have the expected fields');
          }
        }
      }
    }
  } catch (error) {
    console.error('Error exploring database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
});