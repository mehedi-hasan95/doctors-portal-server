const express = require('express');
const app = express();
const { MongoClient, ServerApiVersion } = require('mongodb');
cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;

// midleware 
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Hello World!')
  })


const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.USER_SECRET}@cluster0.k4gmzpi.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
async function run () {
    try {
        const appointmentData = client.db("doctorsPortal").collection("slots");
        const appointmentBooking = client.db("doctorsPortal").collection("booking");
        const registerUser = client.db("doctorsPortal").collection("users");
        app.get('/apointmentOptions', async(req, res) => {
            const date = req.query.date;
            const query = {};
            const cursor = appointmentData.find(query);
            const options = await cursor.toArray();


            const appointmentQuery = {appointmentDate: date}
            const alreadyBooked = await appointmentBooking.find(appointmentQuery).toArray();
            options.forEach(option => {
                const booked = alreadyBooked.filter(book => book.service === option.name);
                const bookSlot = booked.map(book => book.time);
                const reminingSlot = option.slots.filter( slot => !bookSlot.includes(slot));
                option.slots = reminingSlot;
            });
            res.send(options);
        })

        // Appointment Booking
        app.get('/booking', async(req, res) => {
            const email = req.query.email;
            const query = {email: email};
            const cursor = await appointmentBooking.find(query).toArray();
            res.send(cursor);
        })

        app.post('/booking', async(req, res) => {
            const body = req.body;
            const query = {
                appointmentDate: body.appointmentDate,
                service: body.service,
                email: body.email,
            }
            const bookingDone = await appointmentBooking.find(query).toArray();
            if(bookingDone.length) {
                const message = `You have a booked on ${body.appointmentDate}`;
                return res.send({acknowledged: false, message});
            }


            const result = await appointmentBooking.insertOne(body);
            res.send(result);
        })

        // Register User Info 
        app.post('/users', async(req, res) => {
            const user = req.body;
            const result = await registerUser.insertOne(user);
            res.send(result);
        })
    }
    finally {

    }
}
run().catch(console.log);





app.listen(port, () => {
  console.log(`Doctors portal server running with: ${port}`)
})