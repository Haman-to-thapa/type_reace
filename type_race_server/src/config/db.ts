import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;

        if (!mongoURI) {
            console.log("⚠️  MONGO_URI not found in .env. Skipping database connection (In-Memory Mode).");
            return;
        }

        await mongoose.connect(mongoURI);
        console.log("✅ MongoDB Connected");

    } catch (error) {
        console.error("❌ MongoDB Connection Error:", error);
        // Do not exit process, just log error and allow server to run in memory mode if needed
        // process.exit(1); 
    }
};

export default connectDB;
