import { PLCConnection } from './src/server/plc/connection.js';
import { DEFAULT_PLC_CONFIG, DEFAULT_VARIABLES, WRITE_VARIABLES } from './src/shared/constants.js';

/**
 * Test PLC Write Operation
 */

// Объединяем все переменные (для чтения и записи)
const allVariables = {
    ...DEFAULT_VARIABLES,
    ...WRITE_VARIABLES
};

console.log('🔧 Testing PLC Write Operation');
console.log('================================');
console.log(`PLC: ${DEFAULT_PLC_CONFIG.host}:${DEFAULT_PLC_CONFIG.port}`);
console.log(`Variables:`, allVariables);
console.log('================================\n');

const plc = new PLCConnection(DEFAULT_PLC_CONFIG);
plc.setVariables(allVariables);

plc.onConnect(() => {
    console.log('✅ Connected to PLC\n');
    
    // Сначала читаем текущее значение
    plc.read()
        .then((data) => {
            console.log('📊 Current PLC Data:');
            console.log(`  status: ${data.status}`);
            console.log(`  clock: ${data.clock}`);
            console.log(`  pos: ${data.pos}`);
            console.log(`  read (DB1002.BYTE0): ${data.read || 'N/A'}\n`);
            
            // Пробуем записать значение
            const testValue = 123;
            console.log(`✍️  Writing value ${testValue} to DB1002.BYTE0 (variable: "read")...`);
            
            return plc.write('read', testValue);
        })
        .then(() => {
            console.log('✅ Write successful!\n');
            
            // Ждем 500мс и читаем снова для проверки
            console.log('⏳ Waiting 500ms...');
            return new Promise(resolve => setTimeout(resolve, 500));
        })
        .then(() => {
            console.log('📖 Reading back to verify...');
            return plc.read();
        })
        .then((data) => {
            console.log(`📊 Verification - read (DB1002.BYTE0): ${data.read || 'N/A'}`);
            
            if (data.read === 123) {
                console.log('✅ SUCCESS! Value was written and verified!\n');
            } else {
                console.log(`⚠️  WARNING: Expected 123, got ${data.read}\n`);
            }
            
            // Тест записи другого значения
            const testValue2 = 50;
            console.log(`✍️  Writing value ${testValue2} to DB1002.BYTE0...`);
            return plc.write('read', testValue2);
        })
        .then(() => {
            console.log('✅ Write successful!');
            console.log('\n🎉 All tests completed!\n');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Error during write test:', error);
            process.exit(1);
        });
});

plc.onError((error) => {
    console.error('❌ PLC Error:', error);
});

// Connect
console.log('🔌 Connecting to PLC...\n');
plc.connect()
    .catch((error) => {
        console.error('❌ Connection failed:', error.message);
        console.error('\n💡 Troubleshooting:');
        console.error('  1. Check PLC IP address (current: ' + DEFAULT_PLC_CONFIG.host + ')');
        console.error('  2. Verify DB1002 exists in TIA Portal');
        console.error('  3. Ensure DB1002.DBB0 variable "read" exists');
        console.error('  4. Check PUT/GET is enabled on PLC');
        console.error('  5. Verify "Optimize block access" is OFF for DB1002\n');
        process.exit(1);
    });
