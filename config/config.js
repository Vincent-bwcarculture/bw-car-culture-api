const config = {
    development: {
      port: process.env.PORT || 5000,
      mongoURI: process.env.MONGO_URI,
      jwtSecret: process.env.JWT_SECRET,
      nodeEnv: 'development'
    },
    production: {
      port: process.env.PORT || 5000,
      mongoURI: process.env.MONGO_URI,
      jwtSecret: process.env.JWT_SECRET,
      nodeEnv: 'production'
    }
  };
  

  
  export default config[process.env.NODE_ENV || 'development'];