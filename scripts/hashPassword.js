import bcrypt from 'bcryptjs';

const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    console.log("Hashed Password:", hashedPassword);
};

hashPassword("E63SBrabusedition"); // Replace with your actual password
