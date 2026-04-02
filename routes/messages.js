const express = require("express");
const router = express.Router();
const messageModel = require("../schemas/messages");
const mongoose = require("mongoose");
const { checkLogin } = require("../utils/authHandler");
const { uploadImage } = require("../utils/uploadHandler");

// GET /api/v1/messages/:userID - Get conversation history
router.get("/:userID", checkLogin, async function (req, res, next) {
  try {
    const messages = await messageModel.find({
      $or: [
        { from: req.user._id, to: req.params.userID },
        { from: req.params.userID, to: req.user._id }
      ]
    }).sort({ createdAt: 1 })
      .populate('from', 'username fullName avatarUrl')
      .populate('to', 'username fullName avatarUrl');
      
    res.send(messages);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

// POST /api/v1/messages/ - Send a message
router.post("/", checkLogin, uploadImage.single("file"), async function (req, res, next) {
  try {
    let { to, text } = req.body;
    let type = "text";
    
    if (req.file) {
      type = "file";
      text = req.file.path;
    }
    
    if (!to || !text) {
      return res.status(400).send({ message: "Recipient and content are required" });
    }

    let newMessage = new messageModel({
      from: req.user._id,
      to: to,
      messageContent: {
        type: type,
        text: text
      }
    });
    const savedMessage = await newMessage.save();
    
    res.send(savedMessage);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

// GET /api/v1/messages/ - Get last message of each conversation
router.get("/", checkLogin, async function (req, res, next) {
  try {
    let objectId = new mongoose.Types.ObjectId(req.user._id);
    let messages = await messageModel.aggregate([
      {
        $match: {
          $or: [{ from: objectId }, { to: objectId }]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: {
              if: { $eq: ["$from", objectId] },
              then: "$to",
              else: "$from"
            }
          },
          message: { $first: "$$ROOT" }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "otherUser"
        }
      },
      {
        $unwind: "$otherUser"
      },
      {
        $project: {
          _id: 0,
          otherUser: {
            _id: 1,
            username: 1,
            fullName: 1,
            avatarUrl: 1
          },
          message: 1
        }
      },
      {
        $sort: { "message.createdAt": -1 }
      }
    ]);

    res.send(messages);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

module.exports = router;
