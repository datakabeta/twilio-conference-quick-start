const pool = require('./dbSync');

class User {
    constructor(userId, participantLabel = null, phoneNumber = null, callSid = null, isInCall = 'N') {
        this.userId = userId;
        this.participantLabel = participantLabel;
        this.phoneNumber = phoneNumber;
        this.callSid = callSid;
        this.isInCall = isInCall;
    }

    save() {
        const query = {
            text: 'INSERT INTO users(userId, participantLabel, phoneNumber, callSid, isInCall) VALUES($1, $2, $3, $4, $5)',
            values: [this.userId, this.participantLabel, this.phoneNumber, this.callSid, this.isInCall],
        };

        try {
            const result = pool.query(query);
            return Promise.resolve(result);
        } catch (err) {
            return Promise.reject(err);
        };
    }
}

class Conference {
    constructor(conferenceId, roomName = null) {
        this.conferenceId = conferenceId;
        this.roomName = roomName;

        // console.log("Conference object received: ",this);
    }

    save() {
        const query = {
            text: 'INSERT INTO conferences(conferencesid, roomName) VALUES($1, $2)',
            values: [this.conferenceId, this.roomName],
        };

        try {
            const result = pool.query(query);
            return Promise.resolve(result);
        } catch (err) {
            return Promise.reject(err);
        };
    }
}

class Call {
    constructor(callSid, participantLabel = null, conferenceSid = null, isCallActive) {
        this.callSid = callSid;
        this.participantLabel = participantLabel;
        this.conferenceSid = conferenceSid;
        this.isCallActive = isCallActive;

        // console.log("call object created: ",this);
    }

    async save() {
        const query = {
            text: 'INSERT INTO calls(callSid, participantLabel, conferenceSid, isCallActive) VALUES($1, $2, $3, $4)',
            values: [this.callSid, this.participantLabel, this.conferenceSid, this.isCallActive],
        };

        try {
            const result = pool.query(query);
            return Promise.resolve(result);
        }

        catch (err) {
            return Promise.reject(err);
        };
    }

    static async findByParticipantLabel(participantLabel) {
        const query = {
            text: 'SELECT * FROM calls WHERE participantLabel = $1 AND isCallActive = $2',
            values: [participantLabel, 'Y'],
        };

        try {
            const result = await pool.query(query);
            return Promise.resolve(result.rows[0]);
        } catch (err) {
            return Promise.reject(err);
        }
    }

    static async updateCallStatus(callSid, isCallActive) {
        const query = {
            text: 'UPDATE calls SET isCallActive = $1 WHERE callSid = $2',
            values: [isCallActive, callSid],
        };

        try {
            const result = await pool.query(query);
            return Promise.resolve(result.rows[0]);
        } catch (err) {
            return Promise.reject(err);
        }
    }
}

module.exports = { User, Conference, Call };
