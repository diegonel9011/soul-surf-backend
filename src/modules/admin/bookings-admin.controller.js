'use strict'

const { listBookings } = require('./bookings-admin.service')
const { ok }           = require('../../utils/response')

async function list(req, res, next) {
  try {
    const { status, class_type, search, page, limit } = req.query
    const result = await listBookings({
      status,
      classType: class_type,
      search,
      page:  page  ? parseInt(page,  10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    })
    return ok(res, result)
  } catch (err) {
    next(err)
  }
}

module.exports = { list }
