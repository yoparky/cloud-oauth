'use strict'

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const eh = require('express-handlebars');
const { Datastore } = require('@google-cloud/datastore');

const app = express();

app.use(bodyParser.json());
app.engine('handlebars', eh.engine());
app.set('view engine', 'handlebars');
app.set('views', './views');

const datastore = new Datastore({
    projectId: 'a6-oauth-386900',
});

const STATE = 'State';
const cId = '749536876-c2bchdu53i8kcitb9fed0d267r929j51.apps.googleusercontent.com';
const cSecret = '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';

// change to host url
const redirectMainUrl = 'http://localhost:8080';

// Random string generator for state from:
// https://stackoverflow.com/questions/16106701/how-to-generate-a-random-string-of-letters-and-numbers-in-javascript
// modified to generate 16 length strings
function stateGen() {
    var state = "";
    
    var charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    
    for (var i = 0; i < 16; i++)
      state += charset.charAt(Math.floor(Math.random() * charset.length));
    
    return state;
}
// uploads value of state to datastore
// returns true if success
async function storeState(datastore, state) {
    try {
        const entity = {
            key: datastore.key(STATE),
            data: {
                value: state
            }
        };
        await datastore.save(entity);
        return true;
    } catch (error) {
        console.error('Datastore uploading value in STATE:', error);
        return false;
    }
}

// querires datastore for state existence
// returns true if state exists on datastore
// else, return false
async function queryState(datastore, state) {
    try {
        const query = datastore.createQuery(STATE)
            .filter('value', '=', state)
            .limit(1);
        const [entities] = await datastore.runQuery(query);
        return entities.length > 0;
    } catch (error) {
        console.error('Datastore checking for value in STATE:', error);
        throw new Error('error');
    }
}


// ROUTES
app.get('/', (req, res) => {
    res.render('home');
});


app.get('/g-auth', async (req, res) => {
    const state = stateGen();
    //console.log(state);
    await storeState(datastore, state);
    //console.log('uploaded state to datastore');

    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' 
        + 'scope=https%3A//www.googleapis.com/auth/userinfo.profile&'
        + 'response_type=code&'
        + 'state=' + state + '&'
        + 'redirect_uri=' + redirectMainUrl + '/home' + '&'
        + 'client_id=' + cId;
    //console.log('redirect url: ' + url);
    res.redirect(url);
});

// redirect home on success
app.get('/home', async (req, res) => {
    const state = req.query.state;
    if (await queryState(datastore, state)) {
        // console.log('state exists in db!');
        // auth code request
        // exchange code for access token
        // https://developers.google.com/identity/protocols/oauth2/web-server#redirecting
        const body = {
            code: req.query.code,
            client_id: cId,
            client_secret: cSecret,
            redirect_uri: redirectMainUrl + '/home',
            grant_type: 'authorization_code'
        };

        try {
            // console.log('Retreiving token');
            const response = await axios.post(
                'https://oauth2.googleapis.com/token',
                body
            );
            // console.log(response.body);
            const type = response.data.token_type;
            const token = response.data.access_token;

            // call to get Google People API
            const people = await axios.get(
                'https://people.googleapis.com/v1/people/me?personFields=names',
                {
                    headers: {
                        Authorization: `${type} ${token}`
                    }
                }
            );
            //console.log(people.data.names);
            const personData = {};
            personData.first = people.data.names[0].givenName;
            personData.last = people.data.names[0].familyName;
            personData.state = req.query.state;
            res.render('person', personData);
        } catch (error) {
            console.error('Error with person data', error);
            res.status(500).send('Internal server error');
        }
    }
});

if (module === require.main) {
    const PORT = process.env.PORT || 8080;
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}...`);
    });
}