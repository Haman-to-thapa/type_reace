import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
    username: string;
    email?: string;
    racesCompleted: number;
    racesWon: number;
    bestWPM: number;
    avgWPM: number;
    createdAt: Date;
}

const UserSchema: Schema = new Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, unique: true, sparse: true },
    racesCompleted: { type: Number, default: 0 },
    racesWon: { type: Number, default: 0 },
    bestWPM: { type: Number, default: 0 },
    avgWPM: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IUser>('User', UserSchema);
