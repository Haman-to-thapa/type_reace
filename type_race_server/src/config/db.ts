import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;

        if (!mongoURI) {
            return;
        }

        await mongoose.connect(mongoURI);

    } catch (error) {
    }
};

export default connectDB;
