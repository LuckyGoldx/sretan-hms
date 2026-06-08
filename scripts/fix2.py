lines = open('C:/Users/LuckyGold/Desktop/Sretan EMR/client/src/components/PatientChart.tsx', 'r').readlines()
lines.insert(1106, "      {activeSection === 'treatment_sheet' && (\n")
open('C:/Users/LuckyGold/Desktop/Sretan EMR/client/src/components/PatientChart.tsx', 'w').writelines(lines)
print('Fixed')
