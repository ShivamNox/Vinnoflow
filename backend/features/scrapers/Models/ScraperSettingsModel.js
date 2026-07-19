import mongoose from 'mongoose';

const scraperSettingsSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // 'hdhub4u'
    enabled: { type: Boolean, default: false },
    interval: { type: Number, default: 600 }, // seconds
    intervalUnit: { type: String, enum: ['seconds', 'minutes'], default: 'minutes' },
    startPage: { type: Number, default: 1 },
    lastScrapedPage: { type: Number, default: 0 },
    // true once the initial catch-up sweep (startPage → 1) has finished;
    // after that, each tick only re-checks the latest pages for new releases.
    caughtUp: { type: Boolean, default: false },
    lastRunAt: { type: Date },
    isRunning: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('ScraperSettings', scraperSettingsSchema);