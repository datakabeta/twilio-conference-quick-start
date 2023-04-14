const Router = require("express").Router;
const { tokenGenerator, createConference, confEventHandler, participantEventsHandler, holdParticipant } = require("./confOrchestrator");

const router = new Router();

router.get("/token", (req, res) => {
  res.send(tokenGenerator());
});

//handles initial outbound call request
router.post("/voice", (req, res) => {
  res.set("Content-Type", "text/xml");
  // console.log("/voice rcvd");
  res.send(createConference(req.body));
});

//CONF - handles conference webhook
router.post("/confEvents", (req, res) => {
  // console.log("/events rcvd", req.body);
  res.send(confEventHandler(req.body));
});

//CONF - handles participant webhook
router.post("/participantEvents", (req, res) => {
  // console.log("/participantEvents received", req.body);
  // res.send(participantEventsHandler(req.body));
});

//CONF - handles hold requests
router.post("/hold", (req, res) => {
  // console.log("/hold received from", req.body);
  res.send(holdParticipant(req.body));
});

module.exports = router;
