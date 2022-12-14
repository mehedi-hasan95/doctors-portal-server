const express = require('express');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
cors = require('cors');

const stripe = require("stripe")(process.env.PAYMENT_KEY);

const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;

// midleware 
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Hello World!')
})


const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.USER_SECRET}@cluster0.k4gmzpi.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// // Verify JWT 
// function verifyJWT(req, res, next) {
//     const verifyToken = req.headers.authorization;
//     if (!verifyToken) {
//         return res.status(401).send('Unauthorize Access');
//     }

//     const token = verifyToken.split(' ')[1];
//     jwt.verify(token, process.env.ACCESS_KEY, function (err, decoded) {
//         if (err) {
//             return res.status(403).send({ message: 'Frobiden Access' })
//         }
//         req.decoded = decoded;
//         next();
//     })
// }

function verifyJWT(req, res, next) {

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send('unauthorized access');
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_KEY, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next();
    })

}

async function run() {
    try {
        const appointmentData = client.db("doctorsPortal").collection("slots");
        const appointmentBooking = client.db("doctorsPortal").collection("booking");
        const registerUser = client.db("doctorsPortal").collection("users");
        const registerDoctors = client.db("doctorsPortal").collection("doctors");
        const patientPayments = client.db("doctorsPortal").collection("payments");

        // Midleware to Verify admin 
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await registerUser.findOne(query);
            if (user.role !== 'admin') {
                return res.status(403).send({ message: 'Unauthorize Access' });
            }
            next();
        }

        app.post('/payments', async(req, res) => {
            const body = req.body;
            const result = await patientPayments.insertOne(body);
            const id = body.serviceId;
            const filter = {_id: ObjectId(id)}
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                  paid: true,
                }
            };
            const updetedStatus = await appointmentBooking.updateOne(filter, updateDoc, options);
            res.send(result);
        })

        app.get('/apointmentOptions', async (req, res) => {
            const date = req.query.date;
            const query = {};
            const cursor = appointmentData.find(query);
            const options = await cursor.toArray();


            const appointmentQuery = { appointmentDate: date }
            const alreadyBooked = await appointmentBooking.find(appointmentQuery).toArray();
            options.forEach(option => {
                const booked = alreadyBooked.filter(book => book.service === option.name);
                const bookSlot = booked.map(book => book.time);
                const reminingSlot = option.slots.filter(slot => !bookSlot.includes(slot));
                option.slots = reminingSlot;
            });
            res.send(options);
        })

        // Appointment Name for doctors
        app.get('/appointmentname', async (req, res) => {
            const query = {};
            const cursor = await appointmentData.find(query).project({ name: 1 }).toArray();
            res.send(cursor);
        })

        // Appointment Booking
        app.get('/booking', verifyJWT, async (req, res) => {
            const email = req.query.email;
            decodedEmail = req.decoded.email;

            if (email !== decodedEmail) {
                res.status(403).send({ message: 'Unauthorize Access' });
            }
            const query = { email: email };
            const cursor = await appointmentBooking.find(query).toArray();
            res.send(cursor);
        })

        app.post('/booking', async (req, res) => {
            const body = req.body;
            const query = {
                appointmentDate: body.appointmentDate,
                service: body.service,
                email: body.email,
            }
            const bookingDone = await appointmentBooking.find(query).toArray();
            if (bookingDone.length) {
                const message = `You have a booked on ${body.appointmentDate}`;
                return res.send({ acknowledged: false, message });
            }


            const result = await appointmentBooking.insertOne(body);
            res.send(result);
        })

        app.get('/booking/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const booking = await appointmentBooking.findOne(query);
            res.send(booking);
        })

        // Register User Info 
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await registerUser.insertOne(user);
            res.send(result);
        })

        // All Users
        app.get('/users', async (req, res) => {
            const query = {};
            const cursor = await registerUser.find(query).toArray();
            res.send(cursor);
        })

        // Make a user as admin
        app.put('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {


            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };
            const result = await registerUser.updateOne(filter, updateDoc, options);
            res.send(result);
        })

        app.put('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        });

        // Prevent all except admin
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await registerUser.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' })
        })

        // Delete user
        app.delete('/users/:id', verifyJWT, async (req, res) => {
            const user = req.params.id;
            const query = { _id: ObjectId(user) }
            const result = await registerUser.deleteOne(query);
            res.send(result)
        })

        // Doctors Section

        app.get('/doctors', async (req, res) => {
            const query = {};
            const cursor = await registerDoctors.find(query).toArray();
            res.send(cursor);
        })


        app.post('/doctors', async (req, res) => {
            const doctor = req.body;
            const result = await registerDoctors.insertOne(doctor);
            res.send(result);
        })

        // Delete a doctor
        app.delete('/doctors/:id', verifyJWT, async (req, res) => {
            const doctor = req.params.id;
            const query = { _id: ObjectId(doctor) }
            const result = await registerDoctors.deleteOne(query);
            res.send(result);
        })


        // Payment 
        app.post("/create-payment-intent", async (req, res) => {
            const items = req.body;
            const price = items.price;
            const amount = price * 100;

            
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": [
                    "card"
                ]
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        // JWT Token
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await registerUser.findOne(query);
            if (result) {
                const token = jwt.sign({ email }, process.env.ACCESS_KEY, { expiresIn: '1h' });
                return res.send({ token })
            }
            res.status(403).send({ message: 'Unauthorize Access' })
        })



    }
    finally {

    }
}
run().catch(console.log);





app.listen(port, () => {
    console.log(`Doctors portal server running with: ${port}`)
})