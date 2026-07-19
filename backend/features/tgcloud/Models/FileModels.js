import mongoose from 'mongoose';

const folderSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  folderId:  { type: String, unique: true },
  parentId:  { type: String, default: null },
  channelId: { type: String, default: null },
});
folderSchema.index({ name: 1, parentId: 1 }, { unique: true });

const fileSchema = new mongoose.Schema({
  folderId:  { type: String, required: true },
  filename:  String,
  fileId:    String,
  messageId: Number,
  channelId: String,
  uniqueId:  { type: String, unique: true },
  size:      Number,
  thumbId:   String,
});

const shareLinkSchema = new mongoose.Schema({
  token:     { type: String, unique: true, required: true },
  uniqueId:  { type: String, required: true },
  fileId:    { type: String, required: true },
  filename:  { type: String, required: true },
  size:      Number,
  createdAt: { type: Date, default: Date.now },
});

export const Folder     = mongoose.model('Folder', folderSchema);
export const FolderFile = mongoose.model('FolderFile', fileSchema);
export const ShareLink  = mongoose.model('ShareLink', shareLinkSchema);
