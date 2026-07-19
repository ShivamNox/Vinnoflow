import mongoose from 'mongoose';

const qualitySchema = new mongoose.Schema({
    quality: { type: String },   // e.g. "720p", "1080p HIGH", "480p HEVC"
    label: { type: String },     // display label
    link: { type: String },      // HubCloud / HubDrive URL
    size: { type: String },      // e.g. "1.2GB"
    host: { type: String }       // 'hubcloud' | 'hubdrive'
}, { _id: false });

const episodeSchema = new mongoose.Schema({
    episode: { type: Number },
    qualities: [qualitySchema]
}, { _id: false });

const hdhub4uSchema = new mongoose.Schema({
    title: { type: String, required: true },
    link: { type: String, required: true, unique: true },
    thumbnail: { type: String, default: '' },
    type: { type: String, enum: ['movie', 'series'], required: true },

    // Movie fields
    qualities: [qualitySchema],

    // Series fields
    episodes: [episodeSchema],

    pageUrl: { type: String }
}, { timestamps: true });

hdhub4uSchema.index({ title: 'text' });
hdhub4uSchema.index({ type: 1, createdAt: -1 });

export default mongoose.model('HDHub4u', hdhub4uSchema);
