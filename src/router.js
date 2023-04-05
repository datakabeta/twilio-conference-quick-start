const Router = require("express").Router;
const { tokenGenerator, voiceResponse } = require("./handler");
const { eventHandler, participantEventsHandler, holdParticipant } = require("./conferenceOrchestrator");

const router = new Router();

router.get("/token", (req, res) => {
  res.send(tokenGenerator());
});

//handles initial outbound call request
router.post("/voice", (req, res) => {
  res.set("Content-Type", "text/xml");
  console.log("/voice rcvd");
  res.send(voiceResponse(req.body));
});

//CONF - handles conference webhook
router.post("/events", (req, res) => {
  // console.log("/events rcvd", req.body);
  res.send(eventHandler(req.body, req.query.to));
});

//CONF - handles participant webhook
router.post("/participantEvents", (req, res) => {
  // console.log("/participantEvents received", req.body);
  res.send(participantEventsHandler(req.body));
});

//CONF - handles hold requests
router.post("/holdParticipant", (req, res) => {
  // console.log("/participantEvents received", req.body);
  res.send(holdParticipant(req.body));
});

module.exports = router;
