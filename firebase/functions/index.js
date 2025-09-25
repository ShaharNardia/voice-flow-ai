const {initializeApp} = require("firebase-admin/app");
initializeApp();

const createAgent = require("./create_agent.js");
exports.createAgent = createAgent.createAgent;
const stripeCustomerSubscription = require("./stripe_customer_subscription.js");
exports.stripeCustomerSubscription =
  stripeCustomerSubscription.stripeCustomerSubscription;
const sendMailToCustomer = require("./send_mail_to_customer.js");
exports.sendMailToCustomer = sendMailToCustomer.sendMailToCustomer;
