let userModel = require('../schemas/users')
let roleModel = require('../schemas/roles')
let ExcelJS = require('exceljs')
let path = require('path')
let { sendPasswordMail } = require('../utils/mailHandler')
let crypto = require('crypto')
module.exports = {
    CreateAnUser: async function (
        username, password, email, role, session,
        fullname, avatarUrl, status, loginCount) {
        let newUser = new userModel({
            username: username,
            password: password,
            email: email,
            fullName: fullname,
            avatarUrl: avatarUrl,
            status: status,
            role: role,
            loginCount: loginCount
        });
        await newUser.save({ session });
        return newUser;
    },
    FindUserByUsername: async function (username) {
        return await userModel.findOne({
            username: username,
            isDeleted: false
        })
    },
    FindUserByEmail: async function (email) {
        return await userModel.findOne({
            email: email,
            isDeleted: false
        })
    }, FindUserByToken: async function (token) {
        return await userModel.findOne({
            forgotPasswordToken: token,
            isDeleted: false
        })
    },
    FindUserById: async function (id) {
        try {
            return await userModel.findOne({
                _id: id,
                isDeleted: false
            }).populate('role')
        } catch (error) {
            return false
        }
    },
    ImportUsers: async function () {
        // Tìm role "user" trong DB
        let userRole = await roleModel.findOne({ name: 'user' })
        if (!userRole) {
            throw new Error('Role "user" not found. Please create the role first.')
        }

        // Đọc file user.xlsx
        let workbook = new ExcelJS.Workbook()
        let filePath = path.join(__dirname, '..', 'user.xlsx')
        await workbook.xlsx.readFile(filePath)

        let worksheet = workbook.getWorksheet(1)
        let results = { success: [], failed: [] }

        // Bỏ qua dòng đầu tiên (header)
        let rows = []
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                rows.push(row)
            }
        })

        for (let row of rows) {
            // Xử lý giá trị cell có thể là formula object
            let getCellValue = (cell) => {
                let val = cell.value
                if (val === null || val === undefined) return null
                if (typeof val === 'object') {
                    // Formula cell: { result: 'value', formula/sharedFormula: '...' }
                    if (val.result !== undefined) return String(val.result)
                    // Rich text cell: { richText: [...] }
                    if (val.richText) return val.richText.map(r => r.text).join('')
                    return String(val)
                }
                return String(val)
            }

            let username = getCellValue(row.getCell(1))
            let email = getCellValue(row.getCell(2))

            if (!username || !email) continue

            // Tạo password ngẫu nhiên 16 ký tự
            let password = crypto.randomBytes(12).toString('base64').slice(0, 16)

            try {
                // Kiểm tra user đã tồn tại chưa
                let existing = await userModel.findOne({ $or: [{ username }, { email }] })
                if (existing) {
                    results.failed.push({ username, email, reason: 'Already exists' })
                    continue
                }

                // Tạo user mới
                let newUser = new userModel({
                    username,
                    email,
                    password,
                    role: userRole._id
                })
                await newUser.save()

                // Gửi email bất đồng bộ (không await để không block)
                sendPasswordMail(email, username, password).catch(err => {
                    console.error(`Failed to send email to ${email}:`, err.message)
                })

                results.success.push({ username, email })
            } catch (err) {
                results.failed.push({ username, email, reason: err.message })
            }
        }

        return results
    }
}