// src/utils/debug.js - Create a debugging utility

export const debugData = (data, context) => {
    if (process.env.NODE_ENV !== 'production') {
      console.group(`Debug: ${context || 'Data Structure'}`);
      console.log('Data:', data);
      
      if (Array.isArray(data)) {
        console.log('Array length:', data.length);
        if (data.length > 0) {
          console.log('First item structure:', Object.keys(data[0]));
          
          // Check images property if it exists
          if (data[0].images) {
            console.log('Image structure:', data[0].images);
          }
        }
      } else if (data && typeof data === 'object') {
        console.log('Object keys:', Object.keys(data));
        
        // Check images property if it exists
        if (data.images) {
          console.log('Image structure:', data.images);
        }
      }
      
      console.groupEnd();
    }
  };