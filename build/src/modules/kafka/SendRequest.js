"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const StreamHandler_1 = require("./StreamHandler");
const log_1 = require("../log");
const types_1 = require("./types");
const errors_1 = require("../errors");
const Rx = require("rx");
const Kafka = require("node-rdkafka");
const GeneralError_1 = require("../errors/GeneralError");
class SendRequestCommon {
    constructor(conf, handleSendError, producerOptions, topicOptions) {
        this.conf = conf;
        this.handleSendError = handleSendError;
        this.messageId = 0;
        this.bufferedMessages = [];
        this.highLatencyBufferedMessages = [];
        this.isReady = false;
        this.isHighLatencyReady = false;
        this.reallySendMessage = (message) => {
            this.doReallySendMessage(message);
        };
        this.responseTopic = `${this.conf.clusterId}.response.${this.conf.clientId}`;
        const ops = Object.assign({
            'client.id': conf.clientId,
            'metadata.broker.list': this.conf.kafkaUrls.join(),
            'retry.backoff.ms': 200,
            'message.send.max.retries': 10,
            'batch.num.messages': 10,
            'message.max.bytes': 1000000000,
            'fetch.message.max.bytes': 1000000000
        }, producerOptions);
        this.producer = new Kafka.Producer(ops, topicOptions ? topicOptions : {});
        this.producer.connect({
            topic: '',
            allTopics: true,
            timeout: 30000
        }, () => log_1.logger.info('producer connect'));
        this.producer.on('ready', () => {
            this.isReady = true;
            this.bufferedMessages.forEach(this.reallySendMessage);
        });
        this.producer.on('event.error', (err) => {
            log_1.logger.logError('producer error', err);
        });
        this.highLatencyProducer = new Kafka.Producer({
            'client.id': conf.clientId,
            'metadata.broker.list': this.conf.kafkaUrls.join(),
            'retry.backoff.ms': 200,
            'message.send.max.retries': 10
        }, {});
        this.highLatencyProducer.connect({
            topic: '',
            allTopics: true,
            timeout: 30000
        }, () => log_1.logger.info('producer connect'));
        this.highLatencyProducer.on('ready', () => {
            this.isHighLatencyReady = true;
            this.highLatencyBufferedMessages.forEach(this.reallySendMessage);
        });
        this.highLatencyProducer.on('event.error', (err) => {
            log_1.logger.logError('producer error', err);
        });
    }
    getResponseTopic() {
        return this.responseTopic;
    }
    sendMessage(transactionId, topic, uri, data, highLatency = true) {
        const message = this.createMessage(transactionId, topic, uri, data);
        message.highLatency = highLatency;
        if (!this.isReady) {
            this.highLatencyBufferedMessages.push(message);
        }
        else {
            this.reallySendMessage(message);
        }
    }
    ;
    sendForwardMessage(originMessage, newTopic, newUri) {
        const message = {
            topic: newTopic,
            message: originMessage
        };
        message.message.uri = newUri;
        if (!this.isReady) {
            this.bufferedMessages.push(message);
        }
        else {
            this.reallySendMessage(message);
        }
    }
    ;
    sendResponse(transactionId, messageId, topic, uri, data) {
        const message = this.createMessage(transactionId, topic, uri, data, types_1.MessageType.RESPONSE, undefined, undefined, messageId);
        if (!this.isReady) {
            this.bufferedMessages.push(message);
        }
        else {
            this.reallySendMessage(message);
        }
    }
    ;
    timeout(message) {
    }
    doReallySendMessage(message) {
        try {
            const msgContent = JSON.stringify(message.message);
            if (message.highLatency === true) {
                log_1.logger.info(`send message ${msgContent} to topic ${message.topic}`);
                this.highLatencyProducer.produce(message.topic, null, new Buffer(msgContent), this.conf.clientId, Date.now());
            }
            else {
                log_1.logger.info(`send low latency message ${msgContent} to topic ${message.topic}`);
                this.producer.produce(message.topic, null, new Buffer(msgContent), this.conf.clientId, Date.now());
            }
            if (message.timeout) {
                setTimeout(() => this.timeout(message), message.timeout);
            }
        }
        catch (e) {
            if (!this.handleSendError || !this.handleSendError(e)) {
                if (e.message.indexOf('Local: Queue full') > -1) {
                    log_1.logger.logError('error while sending the message. exitting...', e);
                    process.exit(1);
                }
                else {
                    log_1.logger.logError('error while sending the message', e);
                }
            }
        }
    }
    getMessageId() {
        this.messageId++;
        return this.messageId;
    }
    createMessage(transactionId, topic, uri, data, messageType = types_1.MessageType.MESSAGE, responseTopic, responseUri, messageId) {
        return {
            topic: topic,
            message: {
                messageType: messageType,
                sourceId: this.conf.clusterId,
                messageId: messageId ? messageId : this.getMessageId(),
                transactionId: transactionId,
                uri: uri,
                responseDestination: responseTopic ? {
                    topic: responseTopic,
                    uri: responseUri
                }
                    :
                        undefined,
                data: data
            }
        };
    }
    ;
}
exports.SendRequestCommon = SendRequestCommon;
class SendRequest extends SendRequestCommon {
    constructor(conf, consumerOptions, initListener = true, topicConf = {}, handleSendError, producerOptions) {
        super(conf, handleSendError, producerOptions, topicConf);
        this.requestedMessages = new Map();
        this.reallySendMessage = (message) => {
            if (message.subject) {
                this.requestedMessages[message.message.messageId] = message.subject;
            }
            super.doReallySendMessage(message);
        };
        if (initListener) {
            log_1.logger.info(`init response listener ${this.responseTopic}`);
            new StreamHandler_1.StreamHandler(this.conf, consumerOptions, [this.responseTopic], (data) => this.handlerResponse(data), topicConf);
        }
    }
    sendRequestAsync(transactionId, topic, uri, data, timeout) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const promise = new types_1.PromiseState();
            this.sendRequestBase(transactionId, topic, uri, data, promise, types_1.SEND_MESSAGE_TYPE.PROMISE, timeout);
            return promise.promise();
        });
    }
    ;
    sendRequest(transactionId, topic, uri, data, timeout) {
        const subject = new Rx.Subject();
        this.sendRequestBase(transactionId, topic, uri, data, subject, types_1.SEND_MESSAGE_TYPE.OBSERVABLE, timeout);
        return subject;
    }
    ;
    sendRequestBase(transactionId, topic, uri, data, subject, sendType, timeout) {
        const message = this.createMessage(transactionId, topic, uri, data, types_1.MessageType.REQUEST, this.responseTopic, 'REQUEST_RESPONSE');
        message.subject = subject;
        message.timeout = timeout;
        message.sendType = sendType;
        if (!this.isReady) {
            this.bufferedMessages.push(message);
        }
        else {
            this.reallySendMessage(message);
        }
    }
    ;
    timeout(message) {
        const msgId = message.message.messageId;
        if (this.requestedMessages[msgId]) {
            this.respondError(message, new errors_1.TimeoutError());
            delete this.requestedMessages[msgId];
        }
    }
    respondData(message, data) {
        if (message.sendType === types_1.SEND_MESSAGE_TYPE.PROMISE) {
            (message.subject).resolve(data);
        }
        else {
            (message.subject).onNext(data);
            (message.subject).onCompleted();
        }
    }
    respondError(message, err) {
        if (message.sendType === types_1.SEND_MESSAGE_TYPE.PROMISE) {
            (message.subject).reject(err);
        }
        else {
            (message.subject).onError(err);
        }
    }
    handlerResponse(message) {
        const msgStr = message.value.toString();
        const msg = JSON.parse(msgStr);
        if (this.requestedMessages[msg.messageId]) {
            this.respondData(this.requestedMessages[msg.messageId], msg);
            delete this.requestedMessages[msg.messageId];
        }
        else {
            log_1.logger.warn(`cannot find where to response (probably timeout happen) "${msgStr}"`);
        }
    }
}
exports.SendRequest = SendRequest;
let instance = null;
function create(conf, consumerOptions, initResponseListener = true, topicConf = {}, producerOptions = {}) {
    instance = new SendRequest(conf, consumerOptions, initResponseListener, topicConf, null, producerOptions);
}
exports.create = create;
function getInstance() {
    return instance;
}
exports.getInstance = getInstance;
function getResponse(msg) {
    if (msg.data != null) {
        const response = msg.data;
        if (response.status != null) {
            throw errors_1.createFromStatus(response.status);
        }
        else {
            return response.data;
        }
    }
    else {
        log_1.logger.error("no data in response of message", msg);
        throw new GeneralError_1.default();
    }
}
exports.getResponse = getResponse;
//# sourceMappingURL=SendRequest.js.map