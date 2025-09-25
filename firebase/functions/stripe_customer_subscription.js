const functions = require("firebase-functions");
const admin = require("firebase-admin");
// To avoid deployment errors, do not call admin.initializeApp() in your code

const stripe = require("stripe")(
  "sk_test_51RoW9MBEKJak3ro0jA0jH8974xcak1a1EpdzTR5pOGL5qgGMI4V3UgEjTfyJgG95wHzknUwTuntcI4Zbco99kn5S00Wux331Ro",
);

exports.stripeCustomerSubscription = functions.https.onRequest(
  async (req, res) => {
    // Write your code below!
    try {
      // Log to check if the webhook was received
      console.log("Received Stripe webhook request");

      const sig = req.headers["stripe-signature"];
      const endpointSecret = "whsec_cO6LPtRCkStCtD9vjiwrwD8226waLKql";

      // Verify the event and log if verification fails
      let event;
      try {
        event = stripe.webhooks.constructEvent(
          req.rawBody,
          sig,
          endpointSecret,
        );
      } catch (err) {
        console.error("Error verifying Stripe signature:", err.message);
        return res.sendStatus(400);
      }

      const handleSubscriptionEvent = async (eventType, subscribed) => {
        const dataObject = event.data.object;

        console.log(
          `Processing ${eventType} event for customer ID: ${dataObject.customer}`,
        );

        const userSnapshot = await admin
          .firestore()
          .collection("user")
          .where("stripe_customer_id", "==", dataObject.customer)
          .get();

        if (userSnapshot.empty) {
          console.warn(
            `No user found with stripeCustomerId: ${dataObject.customer}`,
          );
          return;
        }

        await Promise.all(
          userSnapshot.docs.map(async (userDoc) => {
            const userRef = userDoc.ref;
            console.log(`Updating user document for user ID: ${userDoc.id}`);
            await userRef.update({
              subscribed: subscribed,
              stripe_subscription_id: dataObject.id,
              stripe_subscription_status: dataObject.status,
            });
            console.log(
              `User document updated successfully for user ID: ${userDoc.id}`,
            );
          }),
        );
      };

      // Handling different subscription events
      if (event.type === "customer.subscription.created") {
        console.log("Handling 'customer.subscription.created' event");
        await handleSubscriptionEvent("Subscription created", true);
      } else if (event.type === "customer.subscription.deleted") {
        console.log("Handling 'customer.subscription.deleted' event");
        await handleSubscriptionEvent("Subscription deleted", false);
      } else if (event.type === "customer.subscription.updated") {
        console.log("Handling 'customer.subscription.updated' event");
        await handleSubscriptionEvent("Subscription updated", true);
      } else {
        console.log(`Unhandled event type: ${event.type}`);
      }

      // Respond with a 200 status to acknowledge receipt of the webhook
      return res.sendStatus(200);
    } catch (err) {
      console.error("Error processing webhook:", err.message);
      return res.sendStatus(400);
    }
    // Write your code above!
  },
);
