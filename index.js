const express = require("express");
const cors = require("cors");
const app = express();

const admin = require("firebase-admin");

const serviceAccount = require("./digital-life-lessons-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log("decoded in the token", decoded);
    req.decoded_email = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const port = process.env.PORT || 3000;
const crypto = require("crypto");

function generateTrackingId() {
  const prefix = "PREMIUM";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
  const random = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-char random hex

  return `${prefix}-${date}-${random}`;
}
// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tbo2m.mongodb.net/?appName=Cluster0`;

// const uri =
//   "mongodb+srv://digital_life:WKMwFyZMe3Mavmj9@cluster0.tbo2m.mongodb.net/?appName=Cluster0";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const myDB = client.db("digital_life_db");
    const usersCollection = myDB.collection("users");
    const lessonsCollection = myDB.collection("lessons");
    const paymentCollection = myDB.collection("payments");

    //user api

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    app.get("/users", verifyFBToken, async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const newUser = req.body;
      newUser.role = "user";
      const email = req.body.email;
      const query = { email: email };
      const existingUsers = await usersCollection.findOne(query);
      if (existingUsers) {
        res.send({ message: "User already Exist. Plz try again" });
      } else {
        const result = await usersCollection.insertOne(newUser);
        res.send(result);
      }
    });

    app.patch("/users/:id/role", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      // console.log(id);
      const roleAdmin = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: roleAdmin.role,
        },
      };

      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.patch("/users/:email", async (req, res) => {
      const updateData = req.body;
      const email = req.params.email;
      const query = { email: email };

      const update = {
        $set: {
          displayName: updateData.displayName,
          photoURL: updateData.photoURL,
        },
      };
      const options = {};
      const result = await usersCollection.updateOne(query, update, options);
      res.send(result);
    });

    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      console.log(paymentInfo);
      const amount = parseInt(paymentInfo.cost) * 100;

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: `Please pay for: ${paymentInfo.userName}`,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.userEmail,
        mode: "payment",
        metadata: {
          userId: paymentInfo.userId,
          userName: paymentInfo.userName,
          email: paymentInfo.userEmail,
        },
        success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        // success_url: `${process.env.SITE_DOMAIN}/home`
        cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`,
      });

      // console.log(session);
      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      // console.log("session retrieve", session);
      // const trackingId = generateTrackingId();

      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };
      const queryExits = await paymentCollection.findOne(query);
      if (queryExits) {
        return res.send({ message: "Already Exits", transactionId });
      }

      if (session.payment_status === "paid") {
        const id = session.metadata.userId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            accessLevel: "Premium",
            price: 1500,
            // trackingId: trackingId,
          },
        };

        const result = await usersCollection.updateOne(query, update);

        const payment = {
          cost: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          userId: session.metadata.userId,
          userName: session.metadata.userName,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
        };

        if (session.payment_status === "paid") {
          const resultPayment = await paymentCollection.insertOne(payment);

          res.send({
            success: true,
            // trackingId: trackingId,
            transactionId: session.payment_intent,
            paymentInfo: resultPayment,
          });
        }
      }

      res.send({ success: false });
    });

    app.get("/payments", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const query = {};

      console.log("headers", req.headers);

      if (email) {
        query.customerEmail = email;

        // check email address
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "forbidden access" });
        }
      }
      const cursor = usersCollection.find(query).sort({ paidAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    //Lessons apis

    app.get("/allLessons", async (req, res) => {
      const cursor = lessonsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/featuredLessons", async (req, res) => {
      const query = {};
      const { isFeatured } = req.query;

      if (isFeatured) {
        query.isFeatured = isFeatured;
      }
      const options = { sort: { CreateDate: -1 } };
      const cursor = lessonsCollection.find(query, options);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/add-lessons", async (req, res) => {
      const newUser = req.body;
      const result = await lessonsCollection.insertOne(newUser);
      res.send(result);
    });

    app.get("/my-lessons", async (req, res) => {
      const query = {};
      const { email } = req.query;

      if (email) {
        query.CreateBy = email;
      }

      const options = { sort: { CreateDate: -1 } };
      const cursor = lessonsCollection.find(query, options);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.delete("/my-lessons/:id", async (req, res) => {
      const id = req.params.id;
      console.log("ID Server :", id);
      const query = { _id: new ObjectId(id) };
      const result = await lessonsCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/my-lesson/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await lessonsCollection.findOne(query);
      res.send(result);
    });

    //Category
    //  app.get('/category', async (req, res) => {
    //           const result = await parcelsCollection.findA;
    //           res.send(result);
    //       })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
