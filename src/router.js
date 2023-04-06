const Router = require("express").Router;
const { tokenGenerator, voiceResponse, confEventHandler, participantEventsHandler, holdParticipant } = require("./confOrchestrator");

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
router.post("/confEvents", (req, res) => {
  // console.log("/events rcvd", req.body);
  res.send(confEventHandler(req.body, req.query.to));
});

//CONF - handles participant webhook
router.post("/participantEvents", (req, res) => {
  // console.log("/participantEvents received", req.body);
  res.send(participantEventsHandler(req.body));
});

//CONF - handles hold requests
router.post("/hold", (req, res) => {
  console.log("/hold received from", req.body.requesterCallSID);
  res.send(holdParticipant(req.body.requesterCallSID));
});

module.exports = router;
