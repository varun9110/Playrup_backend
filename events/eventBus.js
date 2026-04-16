const PubSub = require('pubsub-js');

const publishSync = (topic, payload) => PubSub.publishSync(topic, payload);
const subscribe = (topic, handler) => PubSub.subscribe(topic, handler);

module.exports = {
  publishSync,
  subscribe
};
