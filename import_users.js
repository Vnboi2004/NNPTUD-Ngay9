/**
 * Script import users từ file user.xlsx
 * Chạy: node import_users.js
 */

const mongoose = require('mongoose')
const ExcelJS = require('exceljs')
const crypto = require('crypto')
const path = require('path')
const nodemailer = require('nodemailer')

const userModel = require('./schemas/users')
const roleModel = require('./schemas/roles')

// ===== CẤU HÌNH =====
const MONGO_URI = 'mongodb+srv://tphung1724_db_user:vQB97fKhTlu3X4AA@demonode.zoidu4j.mongodb.net/?appName=DemoNode'
const EXCEL_FILE = path.join(__dirname, 'user.xlsx')

const transporter = nodemailer.createTransport({
    host: 'sandbox.smtp.mailtrap.io',
    port: 25,
    secure: false,
    auth: {
        user: '0fbbda4a3d1bcc',
        pass: '4be8da53fd2f14',
    },
})

// ===== HÀM TIỆN ÍCH =====
function generatePassword(length = 16) {
    return crypto.randomBytes(24).toString('base64').slice(0, length)
}

function getCellValue(cell) {
    const val = cell.value
    if (val === null || val === undefined) return null
    if (typeof val === 'object') {
        if (val.result !== undefined) return String(val.result)
        if (val.richText) return val.richText.map(r => r.text).join('')
        return String(val)
    }
    return String(val).trim()
}

async function sendPasswordMail(to, username, password) {
    const info = await transporter.sendMail({
        from: 'admin@myapp.com',
        to: to,
        subject: 'Tài khoản của bạn đã được tạo',
        text: `Chào ${username}! Mật khẩu của bạn là: ${password}`,
        html: `<h2>Chào <strong>${username}</strong>!</h2>
               <p>Tài khoản của bạn đã được tạo thành công.</p>
               <p>Mật khẩu của bạn là: <strong style="font-size:18px">${password}</strong></p>
               <p>Vui lòng đăng nhập và đổi mật khẩu ngay.</p>`,
    })
    return info.messageId
}

// ===== MAIN =====
async function main() {
    console.log('🔗 Kết nối MongoDB...')
    await mongoose.connect(MONGO_URI)
    console.log('✅ MongoDB đã kết nối\n')

    // Tìm role "user"
    let userRole = await roleModel.findOne({ name: 'user' })
    if (!userRole) {
        console.log('⚠️  Không tìm thấy role "user". Đang tạo...')
        userRole = await roleModel.create({ name: 'user', description: 'Regular user role' })
        console.log('✅ Đã tạo role "user"\n')
    } else {
        console.log(`✅ Tìm thấy role "user": ${userRole._id}\n`)
    }

    // Đọc file Excel
    console.log(`📂 Đọc file: ${EXCEL_FILE}`)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(EXCEL_FILE)
    const worksheet = workbook.getWorksheet(1)

    const rows = []
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) rows.push(row) // bỏ qua header
    })
    console.log(`📋 Tổng số dòng dữ liệu: ${rows.length}\n`)

    let successCount = 0
    let skipCount = 0
    let failCount = 0

    // Loop từng user
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const username = getCellValue(row.getCell(1))
        const email = getCellValue(row.getCell(2))

        if (!username || !email) {
            console.log(`⏭️  [${i + 1}] Bỏ qua dòng trống`)
            continue
        }

        process.stdout.write(`[${i + 1}/${rows.length}] ${username} (${email}) ... `)

        try {
            // Kiểm tra đã tồn tại chưa
            const existing = await userModel.findOne({ $or: [{ username }, { email }] })
            if (existing) {
                console.log('⏭️  Đã tồn tại, bỏ qua')
                skipCount++
                continue
            }

            // Tạo password ngẫu nhiên 16 ký tự
            const password = generatePassword(16)

            // Tạo user mới (bcrypt hash sẽ tự động qua pre-save hook)
            const newUser = new userModel({
                username,
                email,
                password,
                role: userRole._id,
            })
            await newUser.save()

            // Gửi email
            try {
                const msgId = await sendPasswordMail(email, username, password)
                console.log(`✅ OK (msgId: ${msgId})`)
            } catch (mailErr) {
                console.log(`✅ User tạo OK, ⚠️ Email lỗi: ${mailErr.message}`)
            }

            successCount++
        } catch (err) {
            console.log(`❌ Lỗi: ${err.message}`)
            failCount++
        }
    }

    console.log('\n========================================')
    console.log(`✅ Thành công : ${successCount}`)
    console.log(`⏭️  Bỏ qua    : ${skipCount}`)
    console.log(`❌ Thất bại  : ${failCount}`)
    console.log('========================================\n')

    await mongoose.disconnect()
    console.log('🔌 Đã ngắt kết nối MongoDB')
    process.exit(0)
}

main().catch(err => {
    console.error('❌ Lỗi nghiêm trọng:', err)
    process.exit(1)
})
