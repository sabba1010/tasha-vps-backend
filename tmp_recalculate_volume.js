const { MongoClient } = require('mongodb');
require('dotenv').config();

(async () => {
    try {
        const client = new MongoClient(process.env.MONGO_URI);
        await client.connect();
        const db = client.db('mydb');

        const completedOrders = await db.collection('mypurchase').find({ status: 'completed' }).toArray();
        const totalVolume = completedOrders.reduce((sum, o) => sum + (Number(o.price || o.totalPrice) || 0), 0);

        console.log('Recalculated Total Volume:', totalVolume);

        const result = await db.collection('systemStats').updateOne(
            { _id: 'global' },
            { $set: { totalTurnover: totalVolume, updatedAt: new Date() } }
        );

        if (result.modifiedCount > 0) {
            console.log('Updated systemStats with new totalTurnover.');
        } else {
            console.log('systemStats was already up to date or not found.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
})();
