const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

const port = process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tbo2m.mongodb.net/?appName=Cluster0`;

// const uri = "mongodb+srv://<db_username>:<db_password>@cluster0.tbo2m.mongodb.net/?appName=Cluster0";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const myDB = client.db("digital_life_db");
    const usersCollection = myDB.collection("users");
    const lessonsCollection = myDB.collection("lessons");

    //user api

    app.get("/", async (req, res) => {
      console.log("User");
    });

    app.post("/users", async (req, res) => {
      const newUser = req.body;
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

    //Lessons
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

      const options = { sort: { createdAt: -1 } };
      const cursor = lessonsCollection.find(query, options);
      const result = await cursor.toArray();
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
