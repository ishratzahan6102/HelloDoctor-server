const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000
// webtoken 

const jwt = require('jsonwebtoken');
const { query } = require('express');

// .env er jonno config
require('dotenv').config()
const app = express()

// middle ware
app.use(cors())
app.use(express.json())


const SSLCommerzPayment = require('sslcommerz-lts')
const store_id = process.env.STORE_ID
const store_passwd = process.env.STORE_PASSWORD
const is_live = false //true for live, false for sandbox


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.feigjta.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri)
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function verifyJWT(req, res, next) {
    console.log("token inside verifyJWT", req.headers.authorization)
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send("unAuthorized access")
    }
    const token = authHeader.split(' ')[1]

    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send("forbidden access")
        }
        req.decoded = decoded;
        next();
    })
}

// bookingsconvention
// app.get('/bookings')
// app.get('/bookings/:id')
// app.post('/bookings')
// app.patch('/bookings/:id')
// app.delete('/bookings/:id')

async function run() {
    try {
        const appointmentOptionCollection = client.db("doctors-portal").collection("appointmentOptions");
        const bookingCollection = client.db("doctors-portal").collection("bookings")
        const orderCollection = client.db("doctors-portal").collection("orders")
        const usersCollection = client.db("doctors-portal").collection("users")
        const messageCollection = client.db("doctors-portal").collection("messages")
        const doctorsCollection = client.db("doctors-portal").collection("doctors")


        // NOTE : Doctor k delete korte different jwt t die verify kortesi
        const verifyAdmin = async (req, res, next) => {
            // console.log("inside verify admin",req.decoded.email )
            const decodedEmail = req.decoded.email
            const query = { email: decodedEmail }
            const user = await usersCollection.findOne(query)


            if (user?.role !== "admin") {
                return res.status(403).send({ message: "forbidden Access" })
            }

            next()
        }

        app.get("/appointmentOptions", async (req, res) => {
            const date = req.query.date
            const query = {}
            const options = await appointmentOptionCollection.find(query).toArray()

            // get the booking of the provided dates
            const bookingQuery = { appointmentDate: date }
            const alreadyBooked = await bookingCollection.find(bookingQuery).toArray()


            options.forEach(option => {
                // console.log(option)
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name)
                console.log(optionBooked)
                const bookedSlots = optionBooked.map(book => book.slot)
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
                option.slots = remainingSlots;
                // console.log(date, option.name, remainingSlots.length)
            })
            res.send(options)
        })

        // add doctor er moddhe option choose kortesi
        app.get('/appointmentSpecialty', async (req, res) => {
            const query = {}
            const result = await appointmentOptionCollection.find(query).project({ name: 1 }).toArray()
            res.send(result)
        })

        // temporary adding price
        app.get('/addPrice', async (req, res) => {
            const filter = {}
            const options  = { upsert: true }
            const updateDoc = {
                $set : {
                    price : 99
                }
            }
            const result = await appointmentOptionCollection.updateMany(filter, updateDoc, options)
            console.log(result)
            res.send(result)
        })
        // shob gula user er ghar dhortesi
        app.get('/users', async (req, res) => {
            const query = {}
            const result = await usersCollection.find(query).toArray()
            res.send(result)
        })

        // user ta admin kina check kortesi
        app.get("/users/admin/:email", async (req, res) => {
            const email = req.params.email
            const query = { email }
            const user = await usersCollection.findOne(query)
            res.send({ isAdmin: user?.role === "admin" })
        })

        // admin hobe naki na update kortesi
        app.put('/users/admin/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, options)
            res.send(result);
            console.log(result)
        })

        // user ta real kina eta check kore booking order dekhabo nahole j keu amr email paile kam tamat koira debe
        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email

            if (email !== decodedEmail) {
                return res.status(403).send({ message: "forbidden access" })
            }

            const query = { email: email }
            const bookings = await bookingCollection.find(query).toArray()
            res.send(bookings)
        })
        app.get('/bookings/:id', async(req, res) => {
            const id = req.params.id
            const query = { _id: ObjectId(id) }
            const booking= await bookingCollection.findOne(query)
            res.send(booking)

        })
        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            const query = {
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment
            }
            const alreadyBooked = await bookingCollection.find(query).toArray()

            if (alreadyBooked.length) {
                const message = `You already have a booking on ${booking.appointmentDate}`
                return (res.send({ acknowledged: false, message }))
            }
            const result = await bookingCollection.insertOne(booking);
            res.send(result)
        })

      
        app.get('/jwt', async (req, res) => {
            const email = req.query.email
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
                return res.send({ accessToken: token })
            }
            console.log(user)
            res.status(403).send({ accessToken: " " })
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const query = {}
            const result = await doctorsCollection.find(query).toArray()
            res.send(result)
        })

        app.post('/doctors', verifyJWT, async (req, res) => {
            const doctors = req.body
            const result = await doctorsCollection.insertOne(doctors)
            res.send(result)
        })

        // doctor  k delete kortesi
        app.delete('/doctors/:id', verifyJWT, async (req, res) => {
            const id = req.params.id
            const filter = { _id: ObjectId(id) }
            const result = await doctorsCollection.deleteOne(filter)
            res.send(result)
        })


        app.post('/orders', verifyJWT, async (req, res) => {
            const order = req.body;

            // const {service,email,address} = order;

            // if(!service || !email || !address){
            //     return res.send({ error: "Please provide all the information"})
            // }

            const orderedProduct = await bookingCollection.findOne({ _id: ObjectId(order.service_id)})
            console.log(order)
            const transactionId =  new ObjectId().toString()
            const data = {
                total_amount: orderedProduct.price,
                currency: order.currency,
                tran_id: transactionId, // use unique tran_id for each api call
                success_url: `${process.env.SERVER_URL}/payment/success?transactionId=${transactionId}`,
                fail_url: `${process.env.SERVER_URL}/payment/fail`,
                cancel_url: `${process.env.SERVER_URL}/payment/cancel`,
                ipn_url: `${process.env.SERVER_URL}/payment/ipn`,
                shipping_method: 'Courier',
                product_name: order.treatment,
                product_category: 'Electronic',
                product_profile: 'general',
                cus_name: order.firstName + " " + order.lastName,
                cus_email: order.email,
                cus_add1: order.address,
                cus_add2: 'Dhaka',
                cus_city: 'Dhaka',
                cus_state: 'Dhaka',
                cus_postcode: order.postalCode,
                cus_country: 'Bangladesh',
                cus_phone: '01711111111',
                cus_fax: '01711111111',
                ship_name: "Dhaka",
                ship_add1: 'Dhaka',
                ship_add2: 'Dhaka',
                ship_city: 'Dhaka',
                ship_state: 'Dhaka',
                ship_postcode: 1000,
                ship_country: 'Bangladesh',
            };
            const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live)
            sslcz.init(data).then(apiResponse => {
                // Redirect the user to payment gateway
                let GatewayPageURL = apiResponse.GatewayPageURL
                // console.log(apiResponse)
                orderCollection.insertOne({
                    ...order,
                    price: orderedProduct.price,
                    transactionId,
                    paid: false
                })
                res.send({url : GatewayPageURL})
                
            });
            
            
        })

        app.post('/payment/success' , async(req, res) => {
            const {transactionId} = req.query;

            if(!transactionId){
                res.redirect(`${process.env.CLIENT_URL}/payment/fail`)
            }
            const result = await orderCollection.updateOne({transactionId}, { $set: {paid: true, paidAt: new Date()}})

            if(result.modifiedCount > 0){
                res.redirect(`${process.env.CLIENT_URL}/payment/success?transactionId=${transactionId}`)
            }
        })

     
        app.get('/orders/by-transaction-id/:id', async(req, res) => {
            const {id} = req.params
            const order =  await orderCollection.findOne({ transactionId: id })
            res.send(order)
        })

        app.post('/payment/fail' , async(req, res) => {
            const {transactionId} = req.query;

            if(!transactionId){
                res.redirect(`${process.env.CLIENT_URL}/payment/fail`)
            }

            const result = await orderCollection.deleteOne({transactionId})

            if(result.deletedCount){
                res.redirect(`${process.env.CLIENT_URL}/payment/fail`)
            }

            console.log(transactionId)

        })

        app.post('/messages', async (req, res) => {
            const message = req.body;
            const query = { }
            const result = await messageCollection.insertOne(message);
            res.send(result)
            console.log(message)
        })

        app.get('/messages', async (req, res) => {
            const query = { }
            const message = await messageCollection.find(query).toArray()
            res.send(message)
            console.log(message)
        })

    }
    finally {

    }
}

run().catch(console.log)
app.get('/', (req, res) => {
    res.send("Doctors portal server is running")
})
app.listen(port, () => {
    console.log(`Server running at port ${port}`)
})