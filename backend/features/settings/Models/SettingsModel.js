// features/settings/Models/SettingsModel.js
import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  setupComplete: { type: Boolean, default: false },
  serverUrl:     { type: String, default: '' },
  sessionSecret: { type: String, default: '' },
  admin: {
    email:        { type: String, default: '' },
    passwordHash: { type: String, default: '' },
    displayName:  { type: String, default: '' },
    avatarUrl:    { type: String, default: '' },
  },
  telegram: {
    apiId:       { type: String, default: '' },
    apiHash:     { type: String, default: '' },
    botToken:    { type: String, default: '' },
    dbChannelId: { type: String, default: '' },
    ownerId:     { type: String, default: '' },
    session:     { type: String, default: '' },
    connected:   { type: Boolean, default: false },
  },
}, { timestamps: true });

export const Settings = mongoose.model('Settings', settingsSchema);
