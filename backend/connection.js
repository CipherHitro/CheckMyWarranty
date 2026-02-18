const { Pool } = require('pg')

function connectPostgreSQL(url){
    return new Pool({
        connectionString: url
    })
};

module.exports = {
    connectPostgreSQL
}
