const express = require('express');
const ipfilter = require('express-ipfilter').IpFilter
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser');
const cookieParser=require('cookie-parser');
const sqlite3 = require('sqlite3');
const session = require('express-session');
const fs = require('fs');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const res = require('express/lib/response');
const rateLimiter = new RateLimiterMemory(
  {
    points: 3,
    duration: 10,
  });

const app = express();

const port = 6789;

app.set('view engine', 'ejs');
app.use(expressLayouts);
app.use(express.static('public'))
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(express.static(__dirname + '/public'));

app.use(session({
  cookieName: 'session',
  secret: Math.random().toString(16).substr(2, 8),
  duration: 30 * 60 * 1000,
  activeDuration: 5 * 60 * 1000,
}));

let db = new sqlite3.Database('./public/db/cumparaturi.db', sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Conectare cu succes la baza de date.');
});

const rateLimiterMiddleware = (req, res, next) => {
  rateLimiter.consume(req.ip)
    .then(() => {
      next();
    })
    .catch((rejRes) => {
      res.status(429).send('Too Many Requests');
    });
};

app.use('/autentificare', rateLimiterMiddleware);

var blackList_ips = [];
app.use(ipfilter(blackList_ips))

app.get('/', (req, res) => {
  if(req.session.utilizator) {
    res.locals.rezultatLogin = req.cookies['rezultatLogin'];
    res.locals.tipUtilizator = req.session.tip.toString()
  }
  else{
    res.locals.rezultatLogin = undefined;
    res.locals.tipUtilizator = undefined;
  }
    let sql = `SELECT * from produse`;

    db.all(sql, [], (err, rows) => {
      if (err) {
        throw err;
      }
      let user = null;

      if (req.session.utilizator) {
        user = req.session.utilizator;
      }
      res.render('index', {produse:rows,utilizator: user});
    });
});

app.get('/chestionar', (req, res) => {
  if(req.session.utilizator) {
    fs.readFile('intrebari.json', (err, data) => {
      if (err) throw err;
      req.session.listaIntrebari = JSON.parse(data);
      user = req.session.utilizator;
      res.render('chestionar', {intrebari: req.session.listaIntrebari, utilizator: user});
    });

  }else{
    res.redirect('/autentificare');
  }
});

app.post('/rezultat-chestionar', (req,res)=>{
  let correct_answers = 0;
  if (req.session.utilizator) {
    for (const key in req.body) {
      if (req.body.hasOwnProperty(key)) {
        if (parseInt(req.session.listaIntrebari[key].corect) === parseInt(req.body[key])) {
          correct_answers += 1;
        }
      }
    }
    user = req.session.utilizator;
    res.render('rezultat-chestionar', {corecte: correct_answers, nr_intrebari: req.session.listaIntrebari.length, utilizator: user});
  } else {
    res.redirect('/autentificare');
  }
});

app.get('/autentificare', (req, res) => {
  if(!req.session.utilizator) {
    if (req.cookies['rezultatLogin'] === 'mesajEroare') {
      res.locals.mesajEroare = "Date invalide.";
    } else {
      res.locals.mesajEroare = "";
    }

    res.render('autentificare');
  }else{
    res.redirect('/')
  }
});

app.post('/verificare-autentificare', (req, res) => {
  fs.readFile('utilizatori.json', (err, data) => {
    if (err) throw err;
    let utilizatori = JSON.parse(data);

    for(const utilizator of utilizatori){
      if(req.body['utilizator'] === utilizator.username && req.body['parola'] === utilizator.password){
        console.log('Logare cu succes: ' + utilizator.username);
        res.clearCookie('mesajEroare');
        res.cookie('rezultatLogin',req.body['utilizator']);
        req.session.utilizator = req.body['utilizator'];
        req.session.produse = [];
        req.session.tip = utilizator.type;
        res.redirect('/');
        return;
      }
    }
    res.cookie('rezultatLogin','mesajEroare');
    res.redirect('/autentificare');
  });
});

app.get('/creare-bd', (req, res) => {
  if(req.session.utilizator) {
    db.run('CREATE TABLE IF NOT EXISTS produse(id number PRIMARY KEY AUTOINCREMENT NOT NULL, nume text NOT NULL, pret number NOT NULL)');
    res.redirect('/');
  }else{
    res.redirect('/autentificare');
  }
});

app.get('/inserare-bd', (req, res) => {
  if(req.session.utilizator) {
    const produse = ["Frigider", "Cuptor cu microunde", "Aspirator", "Mașină de spălat", "TV", "Aragaz", "Robot de bucătărie", "Fier de călcat"];
    const producatori = ["Samsung", "Arctic", "Philips", "Electrolux", "Siemens", "Bosch", "Whirlpool", "Albatros"];
    for (let i = 0; i < 5; ++i) {
      var index_produse = Math.floor(Math.random() * produse.length);
      var index_producatori = Math.floor(Math.random() * producatori.length);
      var stmt = db.prepare("INSERT INTO produse (nume, pret) VALUES (?, ?)");
      stmt.run([produse[index_produse] + ' ' + producatori[index_producatori] + ' ' + i, index_produse*5+i], (err) => {
        if (err) {
          console.error(err.message);
        }
      });
    }
    res.redirect('/');
  }else{
    res.redirect('/autentificare');
  }
});
app.post('/adaugare-bd', (req, res) => {
  if(req.session.utilizator) {
    if(req.session.tip.toString() === "admin"){
      let produs = req.body['nume']
      let cantitate = req.body['cantitate']

      var stmt = db.prepare("INSERT INTO produse (nume, pret) VALUES (?, ?)");
      stmt.run([produs, cantitate], (err) => {
            if (err) {
              console.error(err.message);
            }
          });
      res.redirect('/admin')
    }
  }else{
    res.redirect('/autentificare');
  }
});

app.post('/adaugare_cos', (req, res) => {
  if(req.session.produse.indexOf(req.body.id)===-1) {
    req.session.produse.push(parseInt(req.body.id));
  }
  res.redirect('/');
});

app.get('/vizualizare-cos',(req,res)=>{
  if(req.session.utilizator) {
    let sql = `SELECT * from produse`;
    let selected_products = [];

    db.all(sql, [], (err, rows) => {
      if (err) {
        throw err;
      }
      rows.forEach((row) => {
        if (req.session.produse.indexOf(row.id) !== -1) {
          selected_products.push(row.nume);
        }
      });
      res.render('vizualizare-cos',{utilizator:req.session.utilizator, selected_products:selected_products});
    });
  }
  else{
    res.redirect('/autentificare');
  }
});

app.get('/delogare',(req,res)=> {
  if (req.session) {
    req.session.destroy(function (err) {
      if (err) {
        console.log(err);
      } else {
        req.session = null;
        console.log("Delogare cu succes.");
        return res.redirect('/');
      }
    });
  }
});

app.get('/admin',(req,res)=> {
  if(req.session.utilizator){
    if(req.session.tip.toString() === "admin"){
      res.render('admin');
    }else{
      res.send('Nu aveți acces la această pagină.');
    }
  }
  else{
    res.redirect('/')
  }
});

app.all('*', (req, res) => {
  blackList_ips.push(req.ip)
  res.end()
});

app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost:` + port));