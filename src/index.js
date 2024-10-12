// require('dotenv').config({
//     path: './env'
// })
import dotenv from 'dotenv'
import connectDB from "./db/index.js";
import app from './app.js'
dotenv.config({ path: './.env' });
connectDB()
    .then(
        app.listen(process.env.PORT, () => {
            console.log(`Server is running at port: ${process.env.PORT}`);

        })

    ).catch((err) => {
        console.log("MONGODB CONNECTION FAILED!!!", err);

    })

/*

    // Connect to MongoDB

    (async () => {
        try {
            await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
            app.on("error", (error) => {
                console.log("ERRR", error);
                throw error;
            })
            app.listen(process.env.PORT, () => {
                console.log(`App is listening on: ${process.env.PORT}`);
            })
        } catch (error) {
            console.log("ERROR: ", error)
            throw err
        }
    })()

*/
