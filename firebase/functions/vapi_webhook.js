const {getFirestore} = require("firebase-admin/firestore");
const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");

// Helper function to extract job data from transcript/summary
function extractJobDataFromTranscript(transcript, summary, customerNumber) {
  try {
    // Look for common patterns in the transcript/summary
    const text = (transcript || '') + ' ' + (summary || '');
    
    // Extract customer name (look for patterns like "Name: John Doe" or "Customer: Jane Smith")
    const nameMatch = text.match(/(?:name|customer)[:\s]+([a-zA-Z\s]+)/i);
    const customerName = nameMatch ? nameMatch[1].trim() : null;
    
    // Extract email (look for email patterns)
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    const customerEmail = emailMatch ? emailMatch[1] : null;
    
    // Extract address (look for address patterns)
    const addressMatch = text.match(/(?:address|location)[:\s]+([^,]+(?:,\s*[^,]+)*)/i);
    const address = addressMatch ? addressMatch[1].trim() : null;
    
    // Extract appointment time (look for time patterns)
    let requestedTime = new Date();
    const timeMatch = text.match(/(?:appointment|scheduled)[:\s]+([^,]+)/i);
    if (timeMatch) {
      const timeStr = timeMatch[1].trim();
      // Try to parse the time string - this is simplified
      const parsedTime = new Date(timeStr);
      if (!isNaN(parsedTime.getTime())) {
        requestedTime = parsedTime;
      }
    }
    
    // Extract job description/title
    const titleMatch = text.match(/(?:service|job|appointment)[:\s]+([^,]+)/i);
    const title = titleMatch ? titleMatch[1].trim() : "Service Appointment";
    
    // Only return job data if we have at least a customer name
    if (customerName) {
      return {
        customerName,
        customerEmail,
        address,
        requestedTime,
        title,
        description: summary || transcript,
        phoneNumber: customerNumber
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting job data:', error);
    return null;
  }
}

exports.vapiWebhook = onRequest(async (req, res) => {
  try {
    // Log the incoming webhook data
    console.log("Received VAPI webhook:", req.body);

    const event = req.body;
    const db = getFirestore();

    // Handle call status updates
    if (event.message && event.message.type === "status-update") {
      const status = event.message.status;
      const callId = event.message.call?.id;
      const customerNumber = event.message.call?.customer?.number;

      console.log(`Call ${callId} status changed to: ${status}`);

      if (customerNumber) {
        // Find the lead by phone number and update status
        const leadsSnapshot = await db.collection("leads")
          .where("phone", "==", customerNumber)
          .get();

        if (!leadsSnapshot.empty) {
          const batch = db.batch();
          let latestStatus = "Unknown";

          leadsSnapshot.forEach((leadDoc) => {
            let callStatus = "Not Contacted";

            switch (status) {
              case "queued":
                callStatus = "Queued";
                break;
              case "ringing":
                callStatus = "Ringing";
                break;
              case "in-progress":
                callStatus = "In Progress";
                break;
              case "forwarding":
                callStatus = "Forwarding";
                break;
              case "ended":
                callStatus = "Completed";
                break;
              case "failed":
                callStatus = "Failed";
                break;
              case "busy":
                callStatus = "Busy";
                break;
              case "no-answer":
                callStatus = "No Answer";
                break;
              default:
                callStatus = "Unknown";
            }

            batch.update(leadDoc.ref, {
              callStatus: callStatus,
              lastCallDate: new Date()
            });
            latestStatus = callStatus;
          });

          await batch.commit();
          console.log(`Updated call status to ${latestStatus} for phone ${customerNumber}`);
        } else {
          console.log(`No lead found for phone number: ${customerNumber}`);
        }
      }
    }

    // Handle call failed events
    if (event.message && event.message.type === "call-failed") {
      const callId = event.message.call?.id;
      const customerNumber = event.message.call?.customer?.number;
      const failureReason = event.message.failureReason;

      console.log(`Call ${callId} failed for customer: ${customerNumber}, reason: ${failureReason}`);

      if (customerNumber) {
        // Find the lead by phone number and update status
        const leadsSnapshot = await db.collection("leads")
          .where("phone", "==", customerNumber)
          .get();

        if (!leadsSnapshot.empty) {
          const batch = db.batch();
          let latestStatus = "Failed";

          leadsSnapshot.forEach((leadDoc) => {
            let callStatus = "Failed";

            switch (failureReason) {
              case "busy":
                callStatus = "Busy";
                break;
              case "no-answer":
                callStatus = "No Answer";
                break;
              case "invalid-number":
                callStatus = "Invalid Number";
                break;
              default:
                callStatus = "Failed";
            }

            batch.update(leadDoc.ref, {
              callStatus: callStatus,
              lastCallDate: new Date()
            });
            latestStatus = callStatus;
          });

          await batch.commit();
          console.log(`Updated call status to ${latestStatus} for phone ${customerNumber}`);
        }
      }
    }

    // Handle call ended events
    if (event.message && event.message.type === "end-of-call-report") {
      const callId = event.message.call?.id;
      const customerNumber = event.message.call?.customer?.number;
      const transcript = event.message.transcript;
      const summary = event.message.summary;
      const recordingUrl = event.message.recordingUrl;

      console.log(`Call ${callId} ended for customer: ${customerNumber}`);

      if (customerNumber) {
        // Find the lead by phone number and update with call details
        const leadsSnapshot = await db.collection("leads")
          .where("phone", "==", customerNumber)
          .get();

        if (!leadsSnapshot.empty) {
          const batch = db.batch();
          
          leadsSnapshot.forEach((leadDoc) => {
            batch.update(leadDoc.ref, {
              callStatus: "Completed",
              lastCallDate: new Date(),
              lastCallTranscript: transcript || "",
              lastCallSummary: summary || "",
              lastCallRecording: recordingUrl || ""
            });
          });

          await batch.commit();
          console.log(`Updated call details for phone ${customerNumber}`);
        }
      }

      // Check if this call resulted in a job/appointment creation
      // Look for createJob function calls in the transcript or summary
      if (transcript && transcript.toLowerCase().includes('appointment has been scheduled') ||
          summary && summary.toLowerCase().includes('appointment has been scheduled')) {
        
        console.log('Job creation detected in call transcript/summary');
        
        // Extract job details from transcript or summary
        // This is a simplified version - you might need more sophisticated parsing
        const jobData = extractJobDataFromTranscript(transcript, summary, customerNumber);
        
        if (jobData) {
          try {
            // Find the company associated with this phone number
            const companySnapshot = await db.collection("Company")
              .where("companyPhoneNumbers", "array-contains", jobData.phoneNumber || customerNumber)
              .get();

            if (!companySnapshot.empty) {
              const companyDoc = companySnapshot.docs[0];
              
              // Create job record
              const jobRef = db.collection("Jobs").doc();
              await jobRef.set({
                id: jobRef.id,
                title: jobData.title || "Service Appointment",
                description: jobData.description || summary,
                customerName: jobData.customerName || "Unknown",
                customerEmail: jobData.customerEmail || "",
                customerPhone: customerNumber,
                address: jobData.address || "",
                requestedTime: jobData.requestedTime || new Date(),
                status: "Scheduled",
                company: companyDoc.ref,
                createdTime: new Date(),
                assignedTechnician: null,
                priority: "Medium",
                estimatedDuration: 60, // Default 1 hour
                notes: `Created from call ${callId}`,
                callId: callId,
                callTranscript: transcript,
                callSummary: summary,
                callRecordingUrl: recordingUrl
              });

              console.log(`Job created successfully: ${jobRef.id}`);
            } else {
              console.log(`No company found for phone number: ${customerNumber}`);
            }
          } catch (error) {
            console.error('Error creating job:', error);
          }
        }
      }
    }

    res.status(200).send("Webhook processed successfully");
  } catch (error) {
    console.error("Error processing VAPI webhook:", error);
    res.status(500).send("Error processing webhook");
  }
});
