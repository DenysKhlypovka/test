var mong = require("mongodb").MongoClient;
var url = "mongodb://localhost:27017/companiesdb";

var express = require("express");
var app = express();

var bodyPars = require("body-parser");
var jsonParser = bodyPars.json();

var arr = require('dynamic-array').DynamicArray();



//спочатку хотів додати коментарі по-англійськи, але нічого не вийшло, тому написав як міг ¯\_(ツ)_/¯

app.use(bodyPars.urlencoded({extended: false}));
app.use(bodyPars.json());

app.get("/", function(req, res){
	
	 res.sendFile(__dirname + "/index.html");
});

app.post("/new", jsonParser, function(req, res){

	var name = req.body.name.trim();
	var earn = req.body.earn;
	var parent = req.body.parent.trim();
	var parentID = null;



	var Company = {"name": name, "earn": earn};

	console.log(Company);


	//перевірка на правильність заповнення полів
	if (earn == "" || isNaN(earn)) return res.json("Invalid value (Estimated Earnings)");
	if (name == parent) return res.json("Company with the same name already exists (" + name + ")");

	mong.connect(url, function(err, db){

		db.collection("companies").findOne({"name": parent}, function(err, result){

			if (parent != "") {
				if (result == null) return res.json("There is no such company in the DB (" + parent + ")");
				else parentID = result._id;
			}

			db.collection("companies").findOne({"name": name}, function(err, result){

	            if (result ) return res.json("Company with the same name already exists (" + name + ")");

				db.collection("companies").insertOne({"name": name, "earn": earn}, function(err, result){

					res.json("Company " + name + " has been added");	//відповідь сервера

			        if (parentID != null)					//занесення ідентифікатора дочірньої компанії в поле ChildID батьківської
						db.collection("companies").update(
							{_id: parentID}, 
							{$push : { "childID": result.insertedId}}, { _id: false });	
				        
					db.close();		       
				    
				});
			});
		});
	});
});

app.put("/update", jsonParser, function(req, res){

	var oldName = req.body.oldName.trim();
	var name = req.body.name.trim();
	var earn = req.body.earn;
	var parent = req.body.parent.trim();

	//перевірка правильності введення полів
	if (isNaN(earn)) return res.json("Invalid value (Estimated Earnings)");
	if (oldName == "") return res.json("Invalid value (Company Name)");
	if (oldName == parent) return res.json("Invalid value (Parent Company)");

	mong.connect(url, function(err, db){
		
		db.collection("companies").findOne({"name": name}, function(err, results){

            if (results) return res.json("Company with the same name already exists (" + name + ")");
		
			db.collection("companies").findOne({"name": oldName}, function(err, resultOldName){
				
	            if (!resultOldName) return res.json("There is no such company in the DB (" + oldName + ")");

				if (name == "") name = resultOldName.name;		//якщо у формі не було заповнено одного з полів, то вважаємо, що там залишаються старі дані
				if (earn == "") earn = resultOldName.earn;	
				var compId = resultOldName._id;	

				db.collection("companies").findOne({"name": parent}, function(err, resultParent){

					if (!resultParent && parent != "") return res.json("There is no such company in the DB (" + parent + ")");

					if (resultParent != null){
	            	db.collection("companies").update(			//додавання ідентифікатора компанії, яку змінюють, у поле ChildID нової батьківської компанії, якщо остання була змінена
	            		{_id: resultParent._id},				//запит не працює for some reason :/
	            		{$push : { "childID": compId}}) 		//хоча вище ідентичний код працює без проблем

	            	}
	            	db.collection("companies").findOne({"childID": compId}, function(err, resultParentOld){

	            		if (resultParentOld != null)
	            		db.collection("companies").update(		//видалення ідентифікатора компанії, яку змінюють, з поля ChildID старої батьківської компанії, якщо остання була змінена
		            		{"_id": resultParentOld._id},
		            		{$pull: {"childID": compId}});

						db.collection("companies").findOneAndUpdate({"name": oldName}, { $set: {"name": name, "earn": earn}}, 
							//{returnOriginal: false },
							function(err, result){
								res.json("Company " + oldName + " has been updated (" + name + ", " + earn + "K)");
				            db.close();
			        	});
					});
				});
	        });
        });
	});
});

app.get("/view/:name", function(req, res){

	var name = req.params.name.trim();
	
	mong.connect(url, function(err, db){

		db.collection("companies").findOne({"name": name}, function(err, result){

			if (result == null) return res.json("There is no such company in the DB (" + name + ")");	//перевірка, чи компанія є у базі

			//var totalEarn = Number(result.earn);
			var children = String("");
			
			if (!result.childID) children="none"	//якщо у даної компанії є дочірні компанії
			else {

				var array = result.childID;

				array.forEach(function(item, i, ar){

						arr.push(item);

					});

				var outp = function(err, data){		//функція, яка у парі із функцією F повинна була б вивести дочірні компанії
					if (err) throw err;
					console.log("data: " + data);
					res.json("Company Name: " + result.name + "; Estimated Earnings: " + result.earn + "K; Child Companies: " + data);
				};

				var F = function(callback){		//функція, яка перетворює масив ідентифікаторів компаній в стрічку їх назв

						arr.each(function(item){

							db.collection("companies").findOne({_id: item}, function(err, result){

								if (err) return console.log("error: " + err);
								
								if (result.name){
									
									children = children + result.name + ", ";
								}
							});
							
						});
					callback(children);
				}


				F(outp); 	//невдала спроба синхронізувати дві функції

				var allChildren = []; 

				var getChildren = function(array){		//рекурсивна функція, яка мала б зібрати всі можливі дочірні компанії і дочірні компанії дочірних компаній в масив
														//але використовувати рекурсивні функції в асинхронній мові програмування - не найкраща практика
					array.forEach(function(item, i, ar){//це я зрозумів занадто пізно

						if (!allChildren.includes(item)) allChildren.push(item);
						arr.push(item);

					});
					
					arr.each(function(elem){

						db.collection("companies").findOne({_id: elem}, function(err, result){

						if (err) return console.log("error: " + err);

						if (result.childID){
							var array_ = result.childID;
							getChildren(array_);
							}
						else
							if (result.name){ 
								arr.pop();
							}
						});
					});
				}
				
		//		getChildren(array);
	
			  
			}

			res.json("Company Name: " + result.name + "; Estimated Earnings: " + result.earn + "K; Child Companies: " + children);

		 });
	});
});

app.delete("/delete/:id", function(req, res){

	var name = req.params.id.trim();

	mong.connect(url, function(err, db){

	        db.collection("companies").findOneAndDelete({"name": name}, function(err, result){
         	
	            if (!result.value) return res.json("There is no such company in the DB (" + name + ")");	//чи існує документ з такими даними у базі

	            var deletedID = result.value._id;

	            if (result.value.childID != "") var deletedChildren = result.value.childID;		//тимчасова змінна для збереження ідентифікаторів дочірніх елементів, якщо такі є

	   			res.json("Company " + name + " has been deleted");		//відповідь сервера

	            db.collection("companies").findOne({"childID": deletedID}, function(err, results){	//знахождення батьківської компанії

	            	if (results == null) return;

            	db.collection("companies").update(		
            		{"_id": results._id},
            		{$pull: {"childID": deletedID}});

            	db.collection("companies").update(
            		{"_id": results._id},
            		{$push: {"childID": { $each: deletedChildren }}}); //перенесення ідентифакторів дочірніх компаній видаленої компанії до батьківської


				db.close();
            	
	            });
	            
	           
		});

	});
});

app.listen(3000);