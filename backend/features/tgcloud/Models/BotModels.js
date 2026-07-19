import mongoose from "mongoose";

const BOT = mongoose.model("BOT", new mongoose.Schema({ folderId: String }));

const ActiveChannel = mongoose.model(
  "ActiveChannel",
  new mongoose.Schema({
    channelId: { type: String, unique: true },
    folderId: String,
  }),
);

export { BOT, ActiveChannel };
